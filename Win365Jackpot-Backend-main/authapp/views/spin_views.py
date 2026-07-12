"""
authapp/views/spin_views.py
─────────────────────────────────────────────────────────────────────────────
Daily Login Spin Wheel:
  • SpinStatusView          — GET  /api/spin/status/   spins remaining this month
  • SpinWheelSegmentsView   — GET  /api/spin/wheel/     active reward tiers, for
                               rendering the wheel's segments (display only —
                               the actual reward is always decided server-side
                               in SpinPlayView, never on the client)
  • SpinPlayView            — POST /api/spin/play/      resolve + apply one spin
  • SpinHistoryListView     — GET  /api/spin/history/   the user's own spin log
  • AdminSpinSettingsView   — GET/PATCH /api/admin-panel/spin-settings/
                               admin-configurable monthly cap / jackpot cadence / sound

Every automated reward is applied through the SAME wallet-credit helpers
already used by the admin offline-deposit flow — no new crediting logic, no
new transaction-type codes. Non-wallet rewards (VIP upgrade, tournament
entry, event pass, merchandise/vouchers) are applied automatically here too,
each reusing the same model/service each feature's own admin flow uses.
"""
import random

from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework import generics, permissions, status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog
from authapp.models.spin_models import (
    SpinConfig, SpinSettings, SpinGlobalCounter, SpinHistory, MANUAL_FULFILLMENT_TYPES,
)
from authapp.models.gift_level_models import UserGift, UserLevel, PointsLog
from authapp.models.poker_models import PokerRegistration
from authapp.models.events_models import EventTicketRequest
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.spin_serializers import (
    SpinConfigSerializer, SpinHistorySerializer, SpinSettingsSerializer,
)
from authapp.views.admin_offline_deposit_views import _credit_main, _write_rp_txn, VIP_CONFIG, MAX_VIP
from authapp.services.casino_wallet_service import credit_casino_wallet
from authapp.services.notification_service import notify_generic

GIFT_TYPE_MAP = {
    "merch": "merchandise",
    "gift_voucher": "gift_voucher",
    "discount_coupon": "discount_voucher",
}


def _month_key():
    return timezone.now().strftime("%Y-%m")


def _resolved_image(config, request):
    """Uploaded `image` takes priority over the legacy `image_url` link —
    mirrors SpinConfigSerializer.get_resolved_image for the two plain
    APIViews (SpinPlayView, SpinWheelSegmentsView) that don't run the
    reward/segment data through that serializer."""
    if config.image:
        return request.build_absolute_uri(config.image.url)
    return config.image_url or None


def _apply_vip_upgrade(user, actor):
    """Bumps both level systems in lockstep (see gift_level_models.UserLevel /
    admin_offline_deposit_views.VIP_CONFIG) — a spin-driven VIP upgrade isn't
    earned via rolling points, so it sets the level directly rather than
    trying to award "enough" points to cross a threshold."""
    old_vip_level = user.vip_level
    new_vip_level = min(old_vip_level + 1, MAX_VIP)
    if new_vip_level != old_vip_level:
        user.vip_level = new_vip_level
        user.save(update_fields=["vip_level"])

    ul, _ = UserLevel.objects.select_for_update().get_or_create(user=user)
    old_ul_level = ul.level
    before_points = ul.points
    ul.level = max(ul.level, new_vip_level)
    leveled = ul.level != old_ul_level
    if leveled:
        ul.save(update_fields=["level"])

    PointsLog.objects.create(
        user=user, points_added=0, points_before=before_points, points_after=ul.points,
        level_before=old_ul_level, level_after=ul.level, leveled_up=leveled,
        reason="Spin Wheel VIP Upgrade reward", recorded_by=actor,
    )

    label = VIP_CONFIG.get(new_vip_level, {}).get("label", f"VIP {new_vip_level}")
    notify_generic(
        user, "VIP Upgrade! \U0001F451",
        f"Congratulations — your Spin Wheel win upgraded you to {label}!",
        icon="crown",
    )


def _apply_reward(user, config, actor):
    """Applies the SpinConfig's reward automatically. Mirrors the admin
    offline-deposit flow's transaction codes exactly (CBG/CBGNC/ROP) for
    wallet types, and reuses each feature's own registration/gift model for
    everything else."""
    note = f"Spin Wheel Reward — {config.label}"
    rt = config.reward_type

    if rt in ("cash_wallet_bonus", "cashback", "jackpot_bonus"):
        _credit_main(user, "C", config.value, "CBG", note, actor)

    elif rt == "bonus_credits":
        _credit_main(user, "NC", config.value, "CBGNC", note, actor)

    elif rt == "rolling_points":
        _write_rp_txn(user, config.value, "ROP", note, actor)
        notify_generic(
            user, "Rolling Points Won! \U0001F3B0",
            f"You won {config.value} Rolling Points from the Spin Wheel.",
            icon="gift",
        )

    elif rt == "casino_wallet_bonus":
        credit_casino_wallet(user, config.casino_name, "C", config.value, actor, "CBG", note=note)

    elif rt == "vip_upgrade":
        _apply_vip_upgrade(user, actor)

    elif rt == "tournament_entry":
        if config.tournament_id and config.tournament.is_active:
            PokerRegistration.objects.get_or_create(tournament=config.tournament, user=user)
            notify_generic(
                user, "Tournament Entry Won! \U0001F0CF",
                f"You've been registered for {config.tournament.name}.",
                icon="trophy",
            )

    elif rt == "event_pass":
        if config.event_id and config.event.is_active:
            EventTicketRequest.objects.get_or_create(event=config.event, user=user)
            notify_generic(
                user, "Event Pass Won! \U0001F3AB",
                f"You've been registered for {config.event.name}.",
                icon="calendar",
            )

    elif rt in GIFT_TYPE_MAP:
        UserGift.objects.create(
            user=user, amount=config.value, gift_type=GIFT_TYPE_MAP[rt],
            status="pending", description=config.label, created_by=actor,
        )
        notify_generic(
            user, "New Gift! \U0001F381",
            f'You won "{config.label}" — check your Gifts tab to claim it.',
            icon="gift",
        )

    # "no_reward" and any unrecognized type: nothing to credit.


def _pick_non_jackpot(configs):
    """Weighted random pick among active, non-jackpot tiers."""
    weights = [max(c.weight, 0) for c in configs]
    if sum(weights) <= 0:
        return random.choice(configs) if configs else None
    return random.choices(configs, weights=weights, k=1)[0]


class SpinStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_row = SpinSettings.get()
        used = SpinHistory.objects.filter(user=request.user, month_key=_month_key()).count()
        return Response({
            "spins_remaining": max(0, settings_row.max_spins_per_month - used),
            "spins_used_this_month": used,
            "max_spins_per_month": settings_row.max_spins_per_month,
            "sound_enabled": settings_row.sound_enabled,
        })


class SpinWheelSegmentsView(APIView):
    """Active reward tiers for rendering the wheel's visual segments.
    Deliberately omits `weight`/`value` — the client never decides or even
    sees the real odds; SpinPlayView alone resolves the actual reward
    server-side on every spin."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        configs = SpinConfig.objects.filter(is_active=True)
        return Response([
            {
                "id": c.id,
                "label": c.label,
                "reward_type": c.reward_type,
                "image": _resolved_image(c, request),
                "is_jackpot": c.is_jackpot,
            }
            for c in configs
        ])


class SpinPlayView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        month_key = _month_key()
        settings_row = SpinSettings.get()

        # Ensure the singleton counter row exists before we try to lock it —
        # mirrors AdminWallet.get()'s get_or_create pattern.
        SpinGlobalCounter.get()

        with db_transaction.atomic():
            # Lock the user row too, so two concurrent spin requests from the
            # SAME user can't both pass the monthly-cap check before either
            # writes its SpinHistory row.
            type(user).objects.select_for_update().get(pk=user.pk)

            used = SpinHistory.objects.filter(user=user, month_key=month_key).count()
            if used >= settings_row.max_spins_per_month:
                return Response(
                    {"error": f"You've used all {settings_row.max_spins_per_month} spins this month."},
                    status=400,
                )

            # A user's very first-ever spin makes them the Nth *distinct*
            # eligible user platform-wide — that's the only spin of theirs
            # that can ever trigger the jackpot-eligibility milestone.
            is_first_ever_spin = not SpinHistory.objects.filter(user=user).exists()

            counter = SpinGlobalCounter.objects.select_for_update().get(pk=1)
            nth = counter.eligible_user_count
            is_jackpot_turn = False
            if is_first_ever_spin:
                nth = counter.eligible_user_count + 1
                counter.eligible_user_count = nth
                counter.save(update_fields=["eligible_user_count", "updated_at"])
                is_jackpot_turn = nth % max(settings_row.jackpot_every_n_users, 1) == 0

            config = None
            if is_jackpot_turn:
                config = SpinConfig.objects.filter(is_jackpot=True, is_active=True).order_by("?").first()
            if config is None:
                # No jackpot configured (or not this spin's turn) — fall back
                # to a weighted pick among non-jackpot tiers.
                pool = list(SpinConfig.objects.filter(is_jackpot=False, is_active=True))
                config = _pick_non_jackpot(pool)

            if config is None:
                return Response({"error": "Spin rewards are not configured yet. Contact support."}, status=500)

            needs_manual = config.reward_type in MANUAL_FULFILLMENT_TYPES
            if not needs_manual:
                _apply_reward(user, config, actor=user)

            history = SpinHistory.objects.create(
                user=user, config=config,
                reward_type_snapshot=config.reward_type,
                reward_label_snapshot=config.label,
                value_snapshot=config.value,
                is_jackpot_win=bool(is_jackpot_turn and config.is_jackpot),
                global_counter_value=nth,
                month_key=month_key,
                needs_manual_fulfillment=needs_manual,
            )

        ActivityLog.log(
            action="reward_claimed", actor=user, target_user=user,
            description=f"Spin Wheel: {config.label}" + (" (JACKPOT)" if history.is_jackpot_win else ""),
            ip_address=request.META.get("REMOTE_ADDR"),
            meta={"spin_history_id": history.id, "global_counter_value": nth},
        )

        return Response({
            "reward": {
                "config_id": config.id,
                "label": config.label,
                "description": config.description,
                "reward_type": config.reward_type,
                "value": float(config.value),
                "image_url": _resolved_image(config, request),
                "is_jackpot": history.is_jackpot_win,
                "needs_manual_fulfillment": needs_manual,
            },
            "spins_remaining": max(
                0, settings_row.max_spins_per_month - SpinHistory.objects.filter(user=user, month_key=month_key).count()
            ),
        })


class SpinHistoryListView(generics.ListAPIView):
    serializer_class = SpinHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SpinHistory.objects.filter(user=self.request.user)


# ─────────────────────────────────────────────────────────────────────────────
# Admin — SpinConfig CRUD + SpinSettings (used by the "Rewards & Spin" admin tab)
# ─────────────────────────────────────────────────────────────────────────────

def _get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


class AdminSpinConfigListCreateView(generics.ListCreateAPIView):
    queryset = SpinConfig.objects.all()
    serializer_class = SpinConfigSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        obj = serializer.save()
        ActivityLog.log(
            action="settings_changed",
            actor=self.request.user,
            description=f"Created spin reward tier: {obj.label}",
            ip_address=_get_client_ip(self.request),
            meta={"spin_config_id": obj.id},
        )


class AdminSpinConfigDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SpinConfig.objects.all()
    serializer_class = SpinConfigSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        obj = serializer.save()
        ActivityLog.log(
            action="settings_changed",
            actor=self.request.user,
            description=f"Updated spin reward tier: {obj.label}",
            ip_address=_get_client_ip(self.request),
            meta={"spin_config_id": obj.id},
        )

    def perform_destroy(self, instance):
        ActivityLog.log(
            action="settings_changed",
            actor=self.request.user,
            description=f"Deleted spin reward tier: {instance.label}",
            ip_address=_get_client_ip(self.request),
            meta={"spin_config_id": instance.id},
        )
        instance.delete()


class AdminSpinSettingsView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        return Response(SpinSettingsSerializer(SpinSettings.get()).data)

    def patch(self, request):
        obj = SpinSettings.get()
        serializer = SpinSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ActivityLog.log(
            action="settings_changed",
            actor=request.user,
            description="Updated Daily Spin settings",
            ip_address=_get_client_ip(request),
            meta={"fields": list(request.data.keys())},
        )
        return Response(serializer.data)

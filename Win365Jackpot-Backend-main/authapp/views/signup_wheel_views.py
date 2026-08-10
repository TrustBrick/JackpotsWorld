"""
authapp/views/signup_wheel_views.py
─────────────────────────────────────────────────────────────────────────────
Signup Wheel — automatic, one-time, new-user-only. See
authapp/services/wheel_service.py for the eligibility/qualification logic,
authapp/models/wheel_models.py for the model layer.

  • SignupWheelStatusView   — GET  /api/wheel/signup/status/
  • SignupWheelSegmentsView — GET  /api/wheel/signup/segments/
  • SignupWheelPlayView     — POST /api/wheel/signup/play/
  • CombinedWheelHistoryView — GET /api/wheel/history/ (Signup + Bonus +
    legacy SpinHistory, merge-sorted — replaces /api/spin/history/ in the UI)
  • AdminSignupWheelSettingsView          — GET/PATCH /api/admin-panel/wheel/signup/settings/
  • AdminSignupWheelRewardListCreateView  — GET/POST  /api/admin-panel/wheel/signup/rewards/
  • AdminSignupWheelRewardDetailView      — GET/PATCH/DELETE /api/admin-panel/wheel/signup/rewards/<pk>/
  • AdminSignupWheelHistoryListView       — GET /api/admin-panel/wheel/signup/history/ (cross-user)
"""
from django.db import transaction as db_transaction
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog, User
from authapp.models.spin_models import SpinHistory
from authapp.models.wheel_models import (
    BonusWheelSpin, SignupWheelReward, SignupWheelSettings, SignupWheelSpin,
)
from authapp.permissions.admin_role_permissions import HasFinanceAccess
from authapp.serializers.wheel_serializers import (
    SignupWheelRewardSerializer, SignupWheelSettingsSerializer, SignupWheelSpinSerializer,
)
from authapp.services.wheel_service import apply_wheel_reward, resolve_signup_wheel_spin, signup_wheel_status

PAGE_SIZE = 20

_INELIGIBLE_MESSAGES = {
    "disabled": "The Signup Wheel is currently unavailable.",
    "window_expired": "Your Signup Wheel window has expired.",
    "no_spins_left": "You've used all your Signup Wheel spins.",
}


def _get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


def _resolved_image_url(reward, request):
    if reward.image:
        return request.build_absolute_uri(reward.image.url)
    return None


# ─── User-facing ────────────────────────────────────────────────────────────

class SignupWheelStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(signup_wheel_status(request.user))


class SignupWheelSegmentsView(APIView):
    """Active reward tiers for rendering the wheel's segments — deliberately
    omits probability_pct, mirroring how the retired spin wheel's
    SpinWheelSegmentsView already hid weight/value from the client. The
    reward is always resolved server-side in SignupWheelPlayView, never
    trusted from the client."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rewards = SignupWheelReward.objects.filter(is_active=True)
        return Response([
            {
                "id": r.id, "label": r.label, "reward_type": r.reward_type,
                "icon": r.icon, "color": r.color, "image": _resolved_image_url(r, request),
            }
            for r in rewards
        ])


class SignupWheelPlayView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        with db_transaction.atomic():
            # Lock the user row so two concurrent spin requests from the
            # same user can't both pass the eligibility check before either
            # writes its SignupWheelSpin row — same guard the retired spin
            # wheel used for its monthly cap.
            User.objects.select_for_update().get(pk=user.pk)

            status_data = signup_wheel_status(user)
            if not status_data["eligible"]:
                return Response(
                    {"error": _INELIGIBLE_MESSAGES.get(status_data["reason"], "You're not eligible to spin right now.")},
                    status=400,
                )

            reward = resolve_signup_wheel_spin(user)
            if reward is None:
                return Response({"error": "Spin rewards are not configured yet. Contact support."}, status=500)

            apply_wheel_reward(
                user=user, reward_type=reward.reward_type, value=reward.value,
                label=reward.label, actor=user, note=f"Signup Wheel — {reward.label}",
            )

            spin_number = SignupWheelSpin.objects.filter(user=user).count() + 1
            history = SignupWheelSpin.objects.create(
                user=user, reward=reward,
                reward_label_snapshot=reward.label, reward_type_snapshot=reward.reward_type,
                value_snapshot=reward.value, spin_number=spin_number,
            )

        ActivityLog.log(
            action="reward_claimed", actor=user, target_user=user,
            description=f"Signup Wheel: {reward.label}",
            ip_address=_get_client_ip(request),
            meta={"signup_wheel_spin_id": history.id},
        )

        return Response({
            "reward": {
                "config_id": reward.id, "label": reward.label, "reward_type": reward.reward_type,
                "value": float(reward.value), "image_url": _resolved_image_url(reward, request),
            },
            "spins_remaining": max(0, SignupWheelSettings.get().max_lifetime_spins - spin_number),
        })


class CombinedWheelHistoryView(APIView):
    """Signup Wheel + Bonus Wheel + legacy (retired) SpinHistory, merge-sorted
    by date — replaces /api/spin/history/ in the UI so a player's history
    doesn't appear to reset to empty on launch day. Each source is fetched
    in full and merged in Python rather than a real cross-table SQL UNION —
    a given player's lifetime wheel history is small (Signup Wheel caps at
    a handful of spins ever; legacy SpinHistory is frozen, never grows), so
    this stays fast without the complexity of a UNION query."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        rows = []

        for s in SignupWheelSpin.objects.filter(user=user):
            rows.append({
                "source": "signup", "id": s.id, "label": s.reward_label_snapshot,
                "reward_type": s.reward_type_snapshot, "value": float(s.value_snapshot),
                "wheel_name": None, "spun_at": s.spun_at,
            })
        for s in BonusWheelSpin.objects.filter(user=user).select_related("wheel"):
            rows.append({
                "source": "bonus", "id": s.id, "label": s.reward_label_snapshot,
                "reward_type": s.reward_type_snapshot, "value": float(s.value_snapshot),
                "wheel_name": s.wheel.name if s.wheel_id else None, "spun_at": s.spun_at,
            })
        for s in SpinHistory.objects.filter(user=user):
            rows.append({
                "source": "legacy", "id": s.id, "label": s.reward_label_snapshot,
                "reward_type": s.reward_type_snapshot, "value": float(s.value_snapshot),
                "wheel_name": "Daily Login Spin (retired)", "spun_at": s.spun_at,
            })

        rows.sort(key=lambda r: r["spun_at"], reverse=True)

        page = max(1, int(request.GET.get("page", 1) or 1))
        start = (page - 1) * PAGE_SIZE
        page_items = rows[start:start + PAGE_SIZE]
        for r in page_items:
            r["spun_at"] = r["spun_at"].isoformat()

        return Response({"count": len(rows), "page": page, "page_size": PAGE_SIZE, "results": page_items})


# ─── Admin ──────────────────────────────────────────────────────────────────

class AdminSignupWheelSettingsView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        return Response(SignupWheelSettingsSerializer(SignupWheelSettings.get()).data)

    def patch(self, request):
        obj = SignupWheelSettings.get()
        serializer = SignupWheelSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        ActivityLog.log(
            action="settings_changed", actor=request.user,
            description="Updated Signup Wheel settings",
            ip_address=_get_client_ip(request), meta={"fields": list(request.data.keys())},
        )
        return Response(serializer.data)


class AdminSignupWheelRewardListCreateView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        rewards = SignupWheelReward.objects.all()
        return Response({
            "results": SignupWheelRewardSerializer(rewards, many=True, context={"request": request}).data,
            "count": rewards.count(),
        })

    def post(self, request):
        serializer = SignupWheelRewardSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        ActivityLog.log(
            action="settings_changed", actor=request.user,
            description=f"Created Signup Wheel reward tier: {obj.label}",
            ip_address=_get_client_ip(request), meta={"signup_wheel_reward_id": obj.id},
        )
        return Response(SignupWheelRewardSerializer(obj, context={"request": request}).data, status=201)


class AdminSignupWheelRewardDetailView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request, pk):
        reward = SignupWheelReward.objects.filter(pk=pk).first()
        if not reward:
            return Response({"error": "Reward tier not found"}, status=404)
        return Response(SignupWheelRewardSerializer(reward, context={"request": request}).data)

    def patch(self, request, pk):
        reward = SignupWheelReward.objects.filter(pk=pk).first()
        if not reward:
            return Response({"error": "Reward tier not found"}, status=404)
        serializer = SignupWheelRewardSerializer(reward, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        ActivityLog.log(
            action="settings_changed", actor=request.user,
            description=f"Updated Signup Wheel reward tier: {obj.label}",
            ip_address=_get_client_ip(request), meta={"signup_wheel_reward_id": obj.id},
        )
        return Response(serializer.data)

    def delete(self, request, pk):
        reward = SignupWheelReward.objects.filter(pk=pk).first()
        if not reward:
            return Response({"error": "Reward tier not found"}, status=404)
        label = reward.label
        ActivityLog.log(
            action="settings_changed", actor=request.user,
            description=f"Deleted Signup Wheel reward tier: {label}",
            ip_address=_get_client_ip(request), meta={"signup_wheel_reward_id": pk},
        )
        reward.delete()
        return Response({"message": f"Reward tier '{label}' deleted."})


class AdminSignupWheelHistoryListView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        page = max(1, int(request.GET.get("page", 1) or 1))
        qs = SignupWheelSpin.objects.select_related("user")
        q = (request.GET.get("q") or "").strip()
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(user__email__icontains=q) | Q(user__name__icontains=q) | Q(user__user_uid__icontains=q))

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": SignupWheelSpinSerializer(page_items, many=True).data,
        })

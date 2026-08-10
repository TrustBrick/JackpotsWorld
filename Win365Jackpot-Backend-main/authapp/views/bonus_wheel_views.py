"""
authapp/views/bonus_wheel_views.py
─────────────────────────────────────────────────────────────────────────────
Bonus Wheel — never self-service. An admin creates a named BonusWheel with
its own reward tiers, then explicitly assigns spins on it to a target
audience (BonusWheelAssignment), which materializes one BonusWheelGrant per
matching player at that moment (a snapshot, not a live-forever rule — see
authapp/models/wheel_models.py's own docstring for why). See
authapp/services/wheel_service.py for the reward-resolution logic.

  User-facing:
    BonusWheelAvailableView  — GET  /api/wheel/bonus/available/
    BonusWheelSegmentsView   — GET  /api/wheel/bonus/<grant_id>/segments/
    BonusWheelPlayView       — POST /api/wheel/bonus/<grant_id>/play/
    BonusWheelHistoryListView— GET  /api/wheel/bonus/my-history/

  Admin (all under /api/admin-panel/wheel/bonus/):
    AdminBonusWheelListCreateView / AdminBonusWheelDetailView
    AdminBonusWheelRewardListCreateView / AdminBonusWheelRewardDetailView
    AdminBonusWheelAssignPreviewView / AdminBonusWheelAssignView
    AdminBonusWheelAssignmentsListView
    AdminBonusWheelGrantsListView
    AdminBonusWheelHistoryListView
"""
from django.db import transaction as db_transaction
from django.db.models import F, Q
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog, User
from authapp.models.wheel_models import (
    BonusWheel, BonusWheelReward, BonusWheelAssignment, BonusWheelGrant, BonusWheelSpin,
)
from authapp.permissions.admin_role_permissions import HasFinanceAccess
from authapp.serializers.wheel_serializers import (
    BonusWheelSerializer, BonusWheelListSerializer, BonusWheelRewardSerializer,
    BonusWheelAssignmentSerializer, BonusWheelGrantSerializer, BonusWheelSpinSerializer,
)
from authapp.services.wheel_service import apply_wheel_reward, resolve_bonus_wheel_spin

PAGE_SIZE = 20


def _get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


def _resolved_image_url(reward, request):
    if reward.image:
        return request.build_absolute_uri(reward.image.url)
    return None


def _resolve_target_users(*, target_type, target_user_ids=None, target_vip_level=None,
                           target_country=None, target_event_id=None):
    """Shared by the assignment preview (count only) and the actual assign
    action (materializes a grant per row). "individual" respects the
    admin's explicit picks as-is (even an inactive account, since that's a
    deliberate per-user action); the broader criteria-based modes exclude
    inactive accounts — no point granting spins nobody can use."""
    if target_type == "individual":
        return User.objects.filter(id__in=target_user_ids or [])
    if target_type == "vip_level":
        return User.objects.filter(vip_level=target_vip_level, is_active=True)
    if target_type == "country":
        return User.objects.filter(country=target_country, is_active=True)
    if target_type == "event_registrants":
        return User.objects.filter(event_ticket_requests__event_id=target_event_id, is_active=True).distinct()
    return User.objects.none()


# ─── User-facing ────────────────────────────────────────────────────────────

class BonusWheelAvailableView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # spins_used__lt=F("spins_total") narrows to grants with spins left
        # at the DB level; expiry/active-wheel checks (is_usable) still run
        # in Python per-row since they involve timezone.now() and a related
        # wheel's own is_currently_active property, not expressible as a
        # single queryset filter without duplicating that property's logic.
        grants = (
            BonusWheelGrant.objects.select_related("wheel", "assignment")
            .filter(user=request.user, spins_used__lt=F("spins_total"))
        )
        usable = [g for g in grants if g.is_usable]
        return Response({"results": BonusWheelGrantSerializer(usable, many=True).data, "count": len(usable)})


class BonusWheelSegmentsView(APIView):
    """Active reward tiers for rendering the wheel's segments — omits
    weight/limits, and for is_mystery tiers additionally hides the real
    label/icon (shown only in the win popup after a spin resolves it)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, grant_id):
        grant = BonusWheelGrant.objects.filter(pk=grant_id, user=request.user).select_related("wheel").first()
        if not grant:
            return Response({"error": "Grant not found"}, status=404)

        rewards = BonusWheelReward.objects.filter(wheel_id=grant.wheel_id, is_active=True)
        return Response([
            {
                "id": r.id,
                "label": "Mystery Reward" if r.is_mystery else r.label,
                "reward_type": "mystery_reward" if r.is_mystery else r.reward_type,
                "icon": "mystery" if r.is_mystery else r.icon,
                "color": r.color,
                "image": None if r.is_mystery else _resolved_image_url(r, request),
                "is_mystery": r.is_mystery,
            }
            for r in rewards
        ])


class BonusWheelPlayView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, grant_id):
        user = request.user

        with db_transaction.atomic():
            grant = (
                BonusWheelGrant.objects.select_for_update()
                .select_related("wheel").filter(pk=grant_id, user=user).first()
            )
            if not grant:
                return Response({"error": "Grant not found"}, status=404)
            if not grant.is_usable:
                return Response({"error": "This wheel isn't available to you right now."}, status=400)

            reward = resolve_bonus_wheel_spin(grant)
            if reward is None:
                return Response({"error": "No rewards are currently available on this wheel. Try again later."}, status=400)

            apply_wheel_reward(
                user=user, reward_type=reward.reward_type, value=reward.value,
                label=reward.label, actor=user, note=f"Bonus Wheel — {grant.wheel.name}: {reward.label}",
                casino_name=reward.casino_name, event=reward.event, grant=grant,
            )

            # If the reward was free_spins, apply_wheel_reward() already
            # mutated this same grant instance's spins_total in place (and
            # saved it) — no refetch needed before incrementing spins_used,
            # a separate update_fields write that can't collide with it.
            grant.spins_used += 1
            grant.save(update_fields=["spins_used"])

            history = BonusWheelSpin.objects.create(
                grant=grant, wheel=grant.wheel, user=user, reward=reward,
                reward_label_snapshot=reward.label, reward_type_snapshot=reward.reward_type,
                value_snapshot=reward.value,
            )

        ActivityLog.log(
            action="reward_claimed", actor=user, target_user=user,
            description=f"Bonus Wheel ({grant.wheel.name}): {reward.label}",
            ip_address=_get_client_ip(request),
            meta={"bonus_wheel_spin_id": history.id, "grant_id": grant.id},
        )

        return Response({
            "reward": {
                "config_id": reward.id, "label": reward.label, "reward_type": reward.reward_type,
                "value": float(reward.value), "image_url": _resolved_image_url(reward, request),
                "is_mystery": reward.is_mystery,
            },
            "spins_remaining": grant.spins_remaining,
        })


# User-facing history is served by the combined view in
# signup_wheel_views.py (CombinedWheelHistoryView — Signup + Bonus + legacy
# SpinHistory, merge-sorted), not a per-type endpoint here — see that
# file's docstring and wheel_urls.py's single GET /wheel/history/ route.


# ─── Admin: wheel + reward CRUD ─────────────────────────────────────────────

class AdminBonusWheelListCreateView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        wheels = BonusWheel.objects.all()
        return Response({
            "results": BonusWheelListSerializer(wheels, many=True, context={"request": request}).data,
            "count": wheels.count(),
        })

    def post(self, request):
        serializer = BonusWheelSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(created_by=request.user)
        ActivityLog.log(
            action="wheel_bonus_wheel_created", actor=request.user,
            description=f"Created Bonus Wheel: {obj.name}",
            ip_address=_get_client_ip(request), meta={"bonus_wheel_id": obj.id},
        )
        return Response(BonusWheelSerializer(obj, context={"request": request}).data, status=201)


class AdminBonusWheelDetailView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request, pk):
        wheel = BonusWheel.objects.filter(pk=pk).first()
        if not wheel:
            return Response({"error": "Wheel not found"}, status=404)
        return Response(BonusWheelSerializer(wheel, context={"request": request}).data)

    def patch(self, request, pk):
        wheel = BonusWheel.objects.filter(pk=pk).first()
        if not wheel:
            return Response({"error": "Wheel not found"}, status=404)
        serializer = BonusWheelSerializer(wheel, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        ActivityLog.log(
            action="wheel_bonus_wheel_created", actor=request.user,
            description=f"Updated Bonus Wheel: {obj.name}",
            ip_address=_get_client_ip(request), meta={"bonus_wheel_id": obj.id},
        )
        return Response(serializer.data)

    def delete(self, request, pk):
        wheel = BonusWheel.objects.filter(pk=pk).first()
        if not wheel:
            return Response({"error": "Wheel not found"}, status=404)
        name = wheel.name
        ActivityLog.log(
            action="wheel_bonus_wheel_created", actor=request.user,
            description=f"Deleted Bonus Wheel: {name}",
            ip_address=_get_client_ip(request), meta={"bonus_wheel_id": pk},
        )
        wheel.delete()
        return Response({"message": f"Bonus Wheel '{name}' deleted."})


class AdminBonusWheelRewardListCreateView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request, wheel_id):
        rewards = BonusWheelReward.objects.filter(wheel_id=wheel_id)
        return Response({
            "results": BonusWheelRewardSerializer(rewards, many=True, context={"request": request}).data,
            "count": rewards.count(),
        })

    def post(self, request, wheel_id):
        wheel = BonusWheel.objects.filter(pk=wheel_id).first()
        if not wheel:
            return Response({"error": "Wheel not found"}, status=404)
        data = {**request.data, "wheel": wheel_id}
        serializer = BonusWheelRewardSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        ActivityLog.log(
            action="wheel_bonus_wheel_created", actor=request.user,
            description=f"Added reward '{obj.label}' to Bonus Wheel: {wheel.name}",
            ip_address=_get_client_ip(request), meta={"bonus_wheel_id": wheel_id, "bonus_wheel_reward_id": obj.id},
        )
        return Response(BonusWheelRewardSerializer(obj, context={"request": request}).data, status=201)


class AdminBonusWheelRewardDetailView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def _get(self, wheel_id, pk):
        return BonusWheelReward.objects.filter(pk=pk, wheel_id=wheel_id).first()

    def patch(self, request, wheel_id, pk):
        reward = self._get(wheel_id, pk)
        if not reward:
            return Response({"error": "Reward tier not found"}, status=404)
        serializer = BonusWheelRewardSerializer(reward, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        ActivityLog.log(
            action="wheel_bonus_wheel_created", actor=request.user,
            description=f"Updated reward '{obj.label}' on Bonus Wheel #{wheel_id}",
            ip_address=_get_client_ip(request), meta={"bonus_wheel_reward_id": obj.id},
        )
        return Response(serializer.data)

    def delete(self, request, wheel_id, pk):
        reward = self._get(wheel_id, pk)
        if not reward:
            return Response({"error": "Reward tier not found"}, status=404)
        label = reward.label
        ActivityLog.log(
            action="wheel_bonus_wheel_created", actor=request.user,
            description=f"Deleted reward '{label}' from Bonus Wheel #{wheel_id}",
            ip_address=_get_client_ip(request), meta={"bonus_wheel_reward_id": pk},
        )
        reward.delete()
        return Response({"message": f"Reward '{label}' deleted."})


# ─── Admin: targeting / assignment / grants / history ───────────────────────

def _validate_target_params(data):
    target_type = data.get("target_type")
    if target_type not in dict(BonusWheelAssignment.TARGET_TYPE_CHOICES):
        return None, Response({"error": "Invalid target_type"}, status=400)

    kwargs = {"target_type": target_type}
    if target_type == "individual":
        ids = data.get("target_user_ids") or []
        if not ids:
            return None, Response({"error": "target_user_ids is required for target_type=individual"}, status=400)
        kwargs["target_user_ids"] = ids
    elif target_type == "vip_level":
        level = data.get("target_vip_level")
        if not level:
            return None, Response({"error": "target_vip_level is required for target_type=vip_level"}, status=400)
        kwargs["target_vip_level"] = level
    elif target_type == "country":
        country = (data.get("target_country") or "").strip().upper()
        if not country:
            return None, Response({"error": "target_country is required for target_type=country"}, status=400)
        kwargs["target_country"] = country
    elif target_type == "event_registrants":
        event_id = data.get("target_event_id")
        if not event_id:
            return None, Response({"error": "target_event_id is required for target_type=event_registrants"}, status=400)
        kwargs["target_event_id"] = event_id

    return kwargs, None


class AdminBonusWheelAssignPreviewView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def post(self, request, wheel_id):
        kwargs, error = _validate_target_params(request.data)
        if error:
            return error
        recipient_count = _resolve_target_users(**kwargs).count()
        return Response({"recipient_count": recipient_count})


class AdminBonusWheelAssignView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def post(self, request, wheel_id):
        wheel = BonusWheel.objects.filter(pk=wheel_id).first()
        if not wheel:
            return Response({"error": "Wheel not found"}, status=404)

        kwargs, error = _validate_target_params(request.data)
        if error:
            return error

        spins_granted = int(request.data.get("spins_granted") or 1)
        if spins_granted < 1:
            return Response({"error": "spins_granted must be at least 1"}, status=400)
        grant_reason = request.data.get("grant_reason") or "other"
        if grant_reason not in dict(BonusWheelAssignment.GRANT_REASON_CHOICES):
            return Response({"error": "Invalid grant_reason"}, status=400)

        with db_transaction.atomic():
            recipients = list(_resolve_target_users(**kwargs))

            assignment = BonusWheelAssignment.objects.create(
                wheel=wheel, target_type=kwargs["target_type"],
                target_vip_level=kwargs.get("target_vip_level"),
                target_country=kwargs.get("target_country", ""),
                target_event_id=kwargs.get("target_event_id"),
                spins_granted=spins_granted, grant_reason=grant_reason,
                expires_at=request.data.get("expires_at") or None,
                note=(request.data.get("note") or "").strip(),
                created_by=request.user, recipient_count=len(recipients),
            )
            if kwargs["target_type"] == "individual":
                assignment.target_users.set(recipients)

            grants = BonusWheelGrant.objects.bulk_create([
                BonusWheelGrant(
                    wheel=wheel, assignment=assignment, user=recipient,
                    spins_total=spins_granted, expires_at=assignment.expires_at,
                )
                for recipient in recipients
            ])

        ActivityLog.log(
            action="wheel_bonus_assigned", actor=request.user,
            description=f"Assigned Bonus Wheel '{wheel.name}' to {len(recipients)} player(s) ({kwargs['target_type']}, reason: {grant_reason})",
            ip_address=_get_client_ip(request),
            meta={"bonus_wheel_id": wheel.id, "assignment_id": assignment.id, "recipient_count": len(recipients)},
        )

        return Response({
            "assignment": BonusWheelAssignmentSerializer(assignment).data,
            "grants_created": len(grants),
        }, status=201)


class AdminBonusWheelAssignmentsListView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request, wheel_id):
        assignments = BonusWheelAssignment.objects.filter(wheel_id=wheel_id).select_related("wheel", "created_by")
        return Response({
            "results": BonusWheelAssignmentSerializer(assignments, many=True).data,
            "count": assignments.count(),
        })


class AdminBonusWheelGrantsListView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        qs = BonusWheelGrant.objects.select_related("wheel", "user", "assignment")
        wheel_id = request.GET.get("wheel_id")
        if wheel_id:
            qs = qs.filter(wheel_id=wheel_id)
        q = (request.GET.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(user__email__icontains=q) | Q(user__name__icontains=q) | Q(user__user_uid__icontains=q))

        page = max(1, int(request.GET.get("page", 1) or 1))
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": BonusWheelGrantSerializer(page_items, many=True).data,
        })


class AdminBonusWheelHistoryListView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        qs = BonusWheelSpin.objects.select_related("user", "wheel")
        wheel_id = request.GET.get("wheel_id")
        if wheel_id:
            qs = qs.filter(wheel_id=wheel_id)
        q = (request.GET.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(user__email__icontains=q) | Q(user__name__icontains=q) | Q(user__user_uid__icontains=q))

        page = max(1, int(request.GET.get("page", 1) or 1))
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": BonusWheelSpinSerializer(page_items, many=True).data,
        })

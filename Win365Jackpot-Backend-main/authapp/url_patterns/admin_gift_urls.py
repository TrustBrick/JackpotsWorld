# authapp/url_patterns/admin_gift_urls.py
# GIFTS-REWARDS: new module — safe to delete this file (and its include in
# authapp/urls.py) to remove the feature. Kept separate from the existing
# gift_level_urls.py so removal never touches the pre-existing gift/claim
# routes (AdminCreateBonusView, UserGiftListView, UserClaimGiftView, etc.).
from django.urls import path
from authapp.views.admin_gift_views import (
    AdminGiftListView,
    AdminGiftExpireView,
    AdminGiftCancelView,
    AdminGiftReissueView,
)

# Admin-managed — mounted at api/admin-panel/gifts-rewards/
admin_urlpatterns = [
    path("gifts-rewards/", AdminGiftListView.as_view()),
    path("gifts-rewards/<int:pk>/expire/", AdminGiftExpireView.as_view()),
    path("gifts-rewards/<int:pk>/cancel/", AdminGiftCancelView.as_view()),
    path("gifts-rewards/<int:pk>/reissue/", AdminGiftReissueView.as_view()),
]

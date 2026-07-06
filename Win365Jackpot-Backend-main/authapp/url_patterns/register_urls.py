from django.urls import path
from ..views import register_views

urlpatterns = [
    # Public endpoint
    path("register/", register_views.register, name="register"),

    # Admin endpoints
    path("admin/registrations/", register_views.registration_list, name="registration_list"),
    path("admin/registrations/stats/", register_views.registration_stats, name="registration_stats"),
    path("admin/registrations/<int:pk>/", register_views.registration_detail, name="registration_detail"),
]
# authapp/url_patterns/landing_urls.py
from django.urls import path
from authapp.views import landing_views as v

# Public — mounted at api/
public_urlpatterns = [
    path("landing-settings/", v.LandingSettingsPublicView.as_view()),
    path("hero-stats/", v.HeroStatListView.as_view()),
    path("why-choose-us/", v.WhyChooseUsFeatureListView.as_view()),
    path("trust-badges/", v.TrustBadgeListView.as_view()),
    path("gift-items/", v.GiftItemListView.as_view()),
    path("gift-steps/", v.GiftStepListView.as_view()),
    path("vip-tiers/", v.VipTierListView.as_view()),
    path("testimonials/", v.TestimonialListView.as_view()),
    path("destinations/", v.DestinationListView.as_view()),
    path("vip-service-images/", v.VipServiceImageListView.as_view()),
    path("tour-packages/", v.TourPackageListView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("landing-settings/", v.AdminLandingSettingsView.as_view()),

    path("hero-stats/", v.AdminHeroStatListCreateView.as_view()),
    path("hero-stats/<int:pk>/", v.AdminHeroStatDetailView.as_view()),

    path("why-choose-us/", v.AdminWhyChooseUsFeatureListCreateView.as_view()),
    path("why-choose-us/<int:pk>/", v.AdminWhyChooseUsFeatureDetailView.as_view()),

    path("trust-badges/", v.AdminTrustBadgeListCreateView.as_view()),
    path("trust-badges/<int:pk>/", v.AdminTrustBadgeDetailView.as_view()),

    path("gift-items/", v.AdminGiftItemListCreateView.as_view()),
    path("gift-items/<int:pk>/", v.AdminGiftItemDetailView.as_view()),

    path("gift-steps/", v.AdminGiftStepListCreateView.as_view()),
    path("gift-steps/<int:pk>/", v.AdminGiftStepDetailView.as_view()),

    path("vip-tiers/", v.AdminVipTierListCreateView.as_view()),
    path("vip-tiers/<int:pk>/", v.AdminVipTierDetailView.as_view()),

    path("vip-tier-benefits/", v.AdminVipTierBenefitListCreateView.as_view()),
    path("vip-tier-benefits/<int:pk>/", v.AdminVipTierBenefitDetailView.as_view()),

    path("testimonials/", v.AdminTestimonialListCreateView.as_view()),
    path("testimonials/<int:pk>/", v.AdminTestimonialDetailView.as_view()),

    path("destinations/", v.AdminDestinationListCreateView.as_view()),
    path("destinations/<int:pk>/", v.AdminDestinationDetailView.as_view()),

    path("destination-media/", v.AdminDestinationMediaListCreateView.as_view()),
    path("destination-media/<int:pk>/", v.AdminDestinationMediaDetailView.as_view()),

    path("vip-service-images/", v.AdminVipServiceImageListCreateView.as_view()),
    path("vip-service-images/<int:pk>/", v.AdminVipServiceImageDetailView.as_view()),

    path("tour-packages/", v.AdminTourPackageListCreateView.as_view()),
    path("tour-packages/<int:pk>/", v.AdminTourPackageDetailView.as_view()),
]

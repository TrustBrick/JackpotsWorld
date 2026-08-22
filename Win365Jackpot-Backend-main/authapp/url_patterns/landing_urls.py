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
    # Hero showcase — independent of destinations above.
    path("premium-partners/", v.PremiumPartnerListView.as_view()),
    # Promotional destination blocks. Separate from destinations/ above and
    # from destination-media/ below — see FeaturedDestinationShowcase's
    # docstring for why this is its own feature rather than a gallery entry.
    path("featured-destination-showcases/", v.FeaturedDestinationShowcaseListView.as_view()),
    # Cinematic hero media for Teen Patti / Poker — ?section=teen_patti|poker
    path("section-media/", v.SectionMediaListView.as_view()),
    path("vip-service-images/", v.VipServiceImageListView.as_view()),
    path("tour-packages/", v.TourPackageListView.as_view()),
    # The prefilled WhatsApp text for each enquiry button. Public because it is
    # the message the visitor is about to send themselves.
    path("enquiry-messages/", v.EnquiryMessageListView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("landing-settings/", v.AdminLandingSettingsView.as_view()),

    path("enquiry-messages/", v.AdminEnquiryMessageListCreateView.as_view()),
    path("enquiry-messages/<int:pk>/", v.AdminEnquiryMessageDetailView.as_view()),

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

    path("premium-partners/", v.AdminPremiumPartnerListCreateView.as_view()),
    path("premium-partners/<int:pk>/", v.AdminPremiumPartnerDetailView.as_view()),

    path("section-media/teen-patti/", v.TeenPattiMediaListCreateView.as_view()),
    path("section-media/teen-patti/<int:pk>/", v.TeenPattiMediaDetailView.as_view()),
    path("section-media/poker/", v.PokerMediaListCreateView.as_view()),
    path("section-media/poker/<int:pk>/", v.PokerMediaDetailView.as_view()),

    path("destination-media/", v.AdminDestinationMediaListCreateView.as_view()),
    path("destination-media/<int:pk>/", v.AdminDestinationMediaDetailView.as_view()),
    path("featured-destination-showcases/", v.AdminFeaturedDestinationShowcaseListCreateView.as_view()),
    path("featured-destination-showcases/<int:pk>/", v.AdminFeaturedDestinationShowcaseDetailView.as_view()),

    path("vip-service-images/", v.AdminVipServiceImageListCreateView.as_view()),
    path("vip-service-images/<int:pk>/", v.AdminVipServiceImageDetailView.as_view()),

    path("tour-packages/", v.AdminTourPackageListCreateView.as_view()),
    path("tour-packages/<int:pk>/", v.AdminTourPackageDetailView.as_view()),
]

import os
from django.db import migrations
from django.core.files import File

# Frontend's public/ directory — sibling repo to this backend, used only to
# copy today's existing static assets into Django media storage so the seed
# data renders byte-identical to what's on the page right now. If this path
# doesn't resolve (e.g. a deploy environment without the frontend repo
# checked out alongside the backend), every attach silently no-ops and the
# field is left blank — the frontend already renders a graceful fallback
# icon for any landing item without an image.
FRONTEND_PUBLIC = os.path.normpath(os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "Win365Jackpot-Frontend-main", "public",
))


def _attach(field_file, relative_path):
    """Copy FRONTEND_PUBLIC/relative_path into `field_file` if it exists."""
    src = os.path.join(FRONTEND_PUBLIC, *relative_path.split("/"))
    if not os.path.isfile(src):
        return
    with open(src, "rb") as f:
        field_file.save(os.path.basename(src), File(f), save=False)


def seed(apps, schema_editor):
    LandingSettings = apps.get_model("authapp", "LandingSettings")
    HeroStat = apps.get_model("authapp", "HeroStat")
    WhyChooseUsFeature = apps.get_model("authapp", "WhyChooseUsFeature")
    TrustBadge = apps.get_model("authapp", "TrustBadge")
    GiftItem = apps.get_model("authapp", "GiftItem")
    GiftStep = apps.get_model("authapp", "GiftStep")
    VipTier = apps.get_model("authapp", "VipTier")
    VipTierBenefit = apps.get_model("authapp", "VipTierBenefit")
    Testimonial = apps.get_model("authapp", "Testimonial")
    Destination = apps.get_model("authapp", "Destination")
    DestinationMedia = apps.get_model("authapp", "DestinationMedia")
    VipServiceImage = apps.get_model("authapp", "VipServiceImage")
    TourPackage = apps.get_model("authapp", "TourPackage")

    # ── Landing Settings (singleton) ────────────────────────────────────────
    settings_obj = LandingSettings(pk=1)
    _attach(settings_obj.hero_background_video, "videos/hero-background.mp4")
    settings_obj.save()

    # ── Hero Stats ───────────────────────────────────────────────────────────
    for i, (label, value) in enumerate([
        ("Players", "20K+"),
        ("Won Today", "$25 Mn+"),
        ("Countries", "10+"),
        ("Support", "24/7"),
    ]):
        HeroStat.objects.create(label=label, value=value, order=i)

    # ── Why Choose Us ────────────────────────────────────────────────────────
    for i, (icon, color, title, desc) in enumerate([
        ("ShieldCheck", "#34d399", "Secure & Licensed", "All casino partners are fully licensed and regulated. Your safety and privacy are our top priority."),
        ("Zap", "#fbbf24", "Instant Payments", "Deposit and withdraw seamlessly across all types of currencies at casinos."),
        ("Gift", "#f472b6", "Exclusive Bonuses", "Special welcome bonuses, reload offers, and cashback deals available only on Jackpots World."),
        ("Globe", "#60a5fa", "10+ Country Access", "One registration unlocks casino opportunities in Vietnam, Macau, India, Sri Lanka, Philippines and more."),
        ("HeadphonesIcon", "#a78bfa", "24/7 Live Support", "Our multilingual support team is available round the clock via WhatsApp, chat, and call."),
        ("PlaneTakeoff", "#22d3ee", "Full Trip Packages", "We handle flights, hotels, transfers, and casino entry. Hassle-free from home to high-stakes table."),
        ("Crown", "#D4AF37", "VIP Membership", "Earn loyalty points on every booking. Unlock exclusive perks, private rooms, and concierge service."),
        ("BarChart3", "#fb923c", "Win Rate Analytics", "Smart tools to track your sessions, analyse performance, and optimise your gaming strategy."),
    ]):
        WhyChooseUsFeature.objects.create(icon_name=icon, color=color, title=title, description=desc, order=i)

    # ── Trust Badges ─────────────────────────────────────────────────────────
    for i, (icon, color, label) in enumerate([
        ("CheckCircle", "#34d399", "Licensed Partners"),
        ("Lock", "#60a5fa", "SSL Secured"),
        ("BadgeCheck", "#a78bfa", "Fair Play Certified"),
        ("MapPin", "#fbbf24", "Pan-Asia Coverage"),
        ("Star", "#D4AF37", "5 Star Rated"),
    ]):
        TrustBadge.objects.create(icon_name=icon, color=color, label=label, order=i)

    # ── Gift Items ───────────────────────────────────────────────────────────
    gifts = [
        dict(tier="LEGENDARY", tier_color="#D4AF37", name="Rolex Submariner",
             subtitle="Swiss Precision · Timeless Prestige", logo="images/logos/rolex.png",
             value="$15K+", description="The icon of icons. A genuine Rolex Submariner — waterproof to 300m, Oystersteel bracelet, Cerachrom bezel. Worn by champions.",
             perks=["Authenticated Certificate", "Luxury Gift Box", "Free Engraving", "Worldwide Delivery"],
             accent_color="#D4AF37", featured=True),
        dict(tier="ULTRA", tier_color="#4FC3F7", name="BMW M3 Competition",
             subtitle="510 HP · Twin-Turbo · The Ultimate Machine", logo="images/logos/bmw.png",
             value="$120K+", description="Pure M. The BMW M3 Competition — 510 horsepower, 0–100 in 3.9 seconds. Win it, drive it, live it.",
             perks=["Full Registration", "Insurance 1st Year", "VIP Delivery Ceremony", "Track Day Experience"],
             accent_color="#4FC3F7", featured=False),
        dict(tier="ULTRA", tier_color="#C0C0C0", name="Mercedes-Benz GLE",
             subtitle="AMG Line · 9G-Tronic · Pure Luxury", logo="images/logos/benz.png",
             value="$95K+", description="The three-pointed star. A Mercedes-Benz GLE AMG Line — commanding presence, whisper-quiet cabin, cutting-edge tech.",
             perks=["Full Registration", "Insurance 1st Year", "Concierge Delivery", "AMG Accessories Pack"],
             accent_color="#C8C8C8", featured=False),
        dict(tier="ELITE", tier_color="#A8A8A8", name="Apple Ultra Bundle",
             subtitle="iPhone 16 Pro Max · MacBook Pro · Vision Pro", logo="images/logos/apple.png",
             value="$6K+", description="The complete Apple ecosystem. iPhone 16 Pro Max, MacBook Pro M4, Apple Watch Ultra 2, and the future — Vision Pro.",
             perks=["Apple Care+ 2 Years", "Setup & Delivery", "Engraving Option", "Accessories Kit"],
             accent_color="#A8A8A8", featured=False),
    ]
    for i, g in enumerate(gifts):
        logo_path = g.pop("logo")
        obj = GiftItem(order=i, **g)
        _attach(obj.logo, logo_path)
        obj.save()

    for i, (icon, label, desc) in enumerate([
        ("🎰", "Play & Win", "Earn with every game — Baccarat, Slots, Roulette & more"),
        ("💰", "Go Highroller", "Qualify as a Highroller and unlock the exclusive prize vault"),
        ("🎁", "Redeem Gifts", "Choose your dream prize from our luxury gifts catalogue"),
        ("🚀", "We Deliver", "Verified, authenticated, delivered to your door worldwide"),
    ]):
        GiftStep.objects.create(icon=icon, label=label, description=desc, order=i)

    # ── VIP Tiers + Benefits ─────────────────────────────────────────────────
    LEVEL_UP = ("Level Up Bonus", "One-time bonus credited when you reach this tier")
    WEEKLY = ("Weekly Bonus", "Weekly reward credited based on your activity")
    MONTHLY = ("Monthly Bonus", "Monthly loyalty bonus added to your balance")
    EXTRAS = ("Extras", "Exclusive privileges and special access perks")
    VIP_HOST = ("VIP Host Luxury Gifts", "Gurated gifts delivered by your personal VIP host")

    tiers = [
        ("bronze",    "Bronze",           "#92400e", "#fef3c7", [LEVEL_UP, WEEKLY]),
        ("silver",    "Silver",           "#374151", "#f3f4f6", [LEVEL_UP, WEEKLY, MONTHLY]),
        ("gold",      "Gold",             "#78350f", "#fef9c3", [LEVEL_UP, WEEKLY, MONTHLY]),
        ("jackpot1",  "Jackpot I",        "#1e3a8a", "#eff6ff", [LEVEL_UP, WEEKLY, MONTHLY, EXTRAS]),
        ("jackpot2",  "Jackpot II",       "#1e3a8a", "#eff6ff", [LEVEL_UP, WEEKLY, MONTHLY, EXTRAS, VIP_HOST]),
        ("jackpot3",  "Jackpot III",      "#1e3a8a", "#eff6ff", [LEVEL_UP, WEEKLY, MONTHLY, EXTRAS, VIP_HOST]),
        ("platinum",  "Platinum Jackpot", "#1f2937", "#f9fafb", [LEVEL_UP, WEEKLY, MONTHLY, EXTRAS, VIP_HOST]),
        ("diamond",   "Diamond Jackpot",  "#1e3a8a", "#dbeafe", [LEVEL_UP, WEEKLY, MONTHLY, EXTRAS, VIP_HOST]),
    ]
    for i, (_id, label, accent_color, accent_bg, benefits) in enumerate(tiers):
        tier_obj = VipTier.objects.create(label=label, accent_color=accent_color, accent_bg=accent_bg, order=i)
        for j, (name, desc) in enumerate(benefits):
            VipTierBenefit.objects.create(tier=tier_obj, name=name, description=desc, order=j)

    # ── Testimonials (main rotating cards) ───────────────────────────────────
    for i, t in enumerate([
        dict(name="Rajesh K.", city="Mumbai, India", country_code="IN", rating=5,
             amount_won="$8.5 Lakhs", destination="Macau", accent_color="#FF6F00",
             text="Jackpots World made my Macau trip absolutely magical! VIP treatment from airport to casino floor. Won big at the Venetian Baccarat tables. The package was worth every rupee!"),
        dict(name="Priya S.", city="Chennai, India", country_code="IN", rating=5,
             amount_won="$2.2 Lakhs", destination="Goa", accent_color="#8E24AA",
             text="First casino experience ever and it couldn't have been better. The Jackpots World team guided me through everything. Walked out with a massive win at Delta Corp roulette!"),
        dict(name="Nguyen T.", city="Ho Chi Minh City", country_code="VN", rating=5,
             amount_won="$4,200", destination="Vietnam", accent_color="#D32F2F",
             text="The Diamond Elite package in Vietnam was extraordinary. Private butler, unlimited credits, and I hit the poker jackpot! Jackpots World is truly Asia's best."),
        dict(name="Arjun M.", city="Bangalore, India", country_code="IN", rating=5,
             amount_won="$12 Lakhs", destination="Philippines", accent_color="#00838F",
             text="Okada Manila with Jackpots World's VIP package — hands down the best experience of my life. Hit a jackpot on the Konami slots and the cashout was instant. 10/10!"),
        dict(name="Kasun P.", city="Colombo, Sri Lanka", country_code="LK", rating=5,
             amount_won="LKR 900K", destination="Sri Lanka", accent_color="#7B1FA2",
             text="Bally's Colombo via Jackpots World was unreal. Got a VIP membership, exclusive table access, and walked away with a life-changing win. The support team was exceptional."),
        dict(name="Carlos R.", city="Manila, Philippines", country_code="PH", rating=5,
             amount_won="₱185,000", destination="Philippines", accent_color="#43A047",
             text="City of Dreams Manila via Jackpots World — simply the BEST! Their concierge handled everything perfectly. Won big at Blackjack 21 and the payout was smooth."),
    ]):
        Testimonial.objects.create(order=i, **t)

    # ── Destinations + media ─────────────────────────────────────────────────
    destinations = [
        dict(name="Vietnam", flag_country_code="VN", tagline="Paradise of the Orient", accent_color="#D32F2F",
             casinos_text="Crown Casino - Danang, Casino Corona - Phu Quoc, Grand casino - Ho Tram",
             best_for="Slots, Baccarat, Hold'em Poker",
             media=[
                 ("images/corona-vietnam.jpg", "image", "Casino Corona, Phu Quoc"),
                 ("images/grand-vietnam.png", "image", "Grand Casino, Ho Tram"),
                 ("images/crown-vietnam.jpeg", "image", "Crown Casino, Danang"),
                 ("videos/vietnam.mp4", "video", "Vietnam Experience"),
             ]),
        dict(name="Macau", flag_country_code="MO", tagline="Vegas of the East", accent_color="#1565C0",
             casinos_text="Venetian, Lisboa Grand, COD, Wynn",
             best_for="High Stakes Baccarat, VIP Rooms",
             media=[
                 ("images/cod-macau.jpg", "image", "COD"),
                 ("images/wynn-macau.jpg", "image", "Wynn"),
                 ("images/venitian-macau.jpg", "image", "Venetian"),
                 ("images/lisbo-macau.jpg", "image", "Lisboa Grand"),
             ]),
        dict(name="India", flag_country_code="IN", tagline="Goa – Where Luck Meets Paradise", accent_color="#FF6F00",
             casinos_text="Big Daddy Casino, Casino Pride, Deltin Jaqk, Deltin Royal, Majestic Pride",
             best_for="Poker, Roulette, Live Dealer Games",
             media=[
                 ("images/bigdaddy-india.png", "image", "Big Daddy Casino"),
                 ("images/deltinjaqk-india.jpg", "image", "Deltin Jaqk"),
                 ("images/deltinroyal-india.jpg", "image", "Deltin Royal"),
                 ("images/majesticpride-india.jpg", "image", "Majestic Pride"),
                 ("images/casinopride-india.jpg", "image", "Casino Pride"),
             ]),
        dict(name="Sri Lanka", flag_country_code="LK", tagline="Jewel of the Indian Ocean", accent_color="#7B1FA2",
             casinos_text="Bally's Colombo, Marina, Ballagio, Majestic Pride, City of Dreams",
             best_for="Blackjack, Slots, Live Poker",
             media=[
                 ("images/majesticpride-srilanka.jpg", "image", "Majestic Pride"),
                 ("images/ballys-srilanka.jpg", "image", "Bally's"),
                 ("images/ballagio-srilanka.jpeg", "image", "Ballagio"),
                 ("images/marina-srilanka.jpg", "image", "Marina"),
                 ("images/cod-srilanka.jpg", "image", "City of Dreams"),
             ]),
        dict(name="Philippines", flag_country_code="PH", tagline="Entertainment City Manila", accent_color="#00838F",
             casinos_text="Solaire Resort Casino, City of Dreams - Manila",
             best_for="Baccarat, Roulette, Sports Betting",
             media=[
                 ("images/Solaire-ph.jpg", "image", "Solaire Resort Casino"),
                 ("images/cod-ph.jpg", "image", "City of Dreams Manila"),
             ]),
    ]
    for i, d in enumerate(destinations):
        media = d.pop("media")
        dest_obj = Destination.objects.create(order=i, **d)
        for j, (path, media_type, label) in enumerate(media):
            media_obj = DestinationMedia(destination=dest_obj, media_type=media_type, label=label, order=j)
            _attach(media_obj.media, path)
            media_obj.save()

    # ── VIP Services Gallery ─────────────────────────────────────────────────
    for i, (path, label, category) in enumerate([
        ("images/vip/massage-1.jpg", "Classic Massage", "Wellness"),
        ("images/vip/massage-2.png", "Luxury Spa", "Wellness"),
        ("images/vip/bar-1.jpg", "Premium Bar Counter", "Bar & Drinks"),
        ("images/vip/bar-2.jpg", "Exclusive Cellar", "Bar & Drinks"),
        ("images/vip/dance-1.jpg", "Live Dance Show", "Entertainment"),
        ("images/vip/dance-2.jpg", "VIP Stage & Lounge", "Entertainment"),
        ("images/vip/lounge-1.jpg", "VIP Lounge Access", "VIP Lounge"),
        ("images/vip/lounge-2.jpg", "Private Suite Lounge", "VIP Lounge"),
        ("images/vip/vip-room-1.jpg", "Exclusive VIP Room", "VIP Rooms"),
        ("images/vip/vip-room-2.avif", "High Roller Room", "VIP Rooms"),
        ("images/vip/private-jet.png", "Private Jet", "Luxury Travel"),
        ("images/vip/luxury-cruise.jpg", "Luxury Cruises", "Luxury Travel"),
        ("images/vip/private-boat.jpg", "Private Boats", "Luxury Travel"),
    ]):
        obj = VipServiceImage(label=label, category=category, order=i)
        _attach(obj.image, path)
        obj.save()

    # ── Tour Packages ────────────────────────────────────────────────────────
    for i, p in enumerate([
        dict(name="VIP", price="$5,000", icon="🃏", color="#9E9E9E", badge="",
             duration="3 Nights", flight="Economy", hotel="Standard 3★ (3N)",
             food="Casino", liquor="Over the Gaming Table (Local)",
             airport_vip=False, jackpot_rewards=True, vip_transport=False,
             spa=False, shopping_voucher=False, visa=False),
        dict(name="Classic", price="$10,000", icon="🎴", color="#78909C", badge="",
             duration="3 Nights", flight="Economy", hotel="Standard 4★ (3N)",
             food="Casino", liquor="Over the Gaming Table (Local Premium)",
             airport_vip=False, jackpot_rewards=True, vip_transport=False,
             spa=True, shopping_voucher=False, visa=True),
        dict(name="Premium", price="$15,000", icon="🎲", color="#D4AF37", badge="Popular",
             duration="3 Nights", flight="Economy", hotel="Standard 5★ (3N)",
             food="Casino", liquor="Over the Gaming Table (Premium)",
             airport_vip=False, jackpot_rewards=True, vip_transport=False,
             spa=True, shopping_voucher=False, visa=True),
        dict(name="Prestige", price="$20,000", icon="🏆", color="#F5A623", badge="",
             duration="3 Nights", flight="Economy", hotel="Executive 5★ (3N)",
             food="Casino", liquor="Over the Gaming Table (Imported Premium)",
             airport_vip=False, jackpot_rewards=True, vip_transport=False,
             spa=True, shopping_voucher=False, visa=True),
        dict(name="Signature", price="$25,000", icon="✍️", color="#26C6DA", badge="",
             duration="3 Nights", flight="Economy", hotel="Premium 5★ (3N)",
             food="Casino", liquor="Over the Gaming Table (Imported Premium)",
             airport_vip=True, jackpot_rewards=True, vip_transport=True,
             spa=True, shopping_voucher=True, visa=True),
        dict(name="Elite", price="$50,000", icon="💎", color="#B9F2FF", badge="Best Value",
             duration="3 Nights", flight="Business", hotel="Suite 5★ (3N)",
             food="Casino/Hotel", liquor="Imported Premium",
             airport_vip=True, jackpot_rewards=True, vip_transport=True, vip_transport_note="*",
             spa=True, spa_note="*", shopping_voucher=True, shopping_note="*", visa=True),
        dict(name="Royal", price="$100,000", icon="👑", color="#FFD700", badge="",
             duration="4 Nights", flight="Business", hotel="Executive Suite 5★ (4N)",
             food="Casino/Hotel", liquor="Imported Premium",
             airport_vip=True, jackpot_rewards=True, vip_transport=True, vip_transport_note="**",
             spa=True, spa_note="**", shopping_voucher=True, shopping_note="**", visa=True),
        dict(name="Sovereign", price="$250,000+", icon="⚜️", color="#C9A84C", badge="🤫 Invite Only",
             duration="7 Nights", flight="Business", hotel="Presidential Suite (7N)",
             food="Casino/Hotel", liquor="Imported Premium",
             airport_vip=True, jackpot_rewards=True, vip_transport=True, vip_transport_note="**",
             spa=True, spa_note="***", shopping_voucher=True, shopping_note="***", visa=True),
    ]):
        TourPackage.objects.create(order=i, **p)


def unseed(apps, schema_editor):
    for name in [
        "HeroStat", "WhyChooseUsFeature", "TrustBadge", "GiftItem", "GiftStep",
        "VipTierBenefit", "VipTier", "Testimonial", "DestinationMedia",
        "Destination", "VipServiceImage", "TourPackage", "LandingSettings",
    ]:
        apps.get_model("authapp", name).objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0022_destination_giftitem_giftstep_herostat_and_more"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]

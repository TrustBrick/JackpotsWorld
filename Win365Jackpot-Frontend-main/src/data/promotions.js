// src/data/promotions.js
//
// Dummy data source for the Promotions page.
//
// ── Backend integration ───────────────────────────────────────────────────
// Swap the body of `fetchPromotions()` for a real call once ready:
//
//   export async function fetchPromotions() {
//     const { data } = await axios.get('/api/promotions')
//     return data
//   }
//
// ────────────────────────────────────────────────────────────────────────────

export const dummyPromotions = [
  {
    id: 'promo-001',
    casinoLogo: 'https://images.unsplash.com/photo-1518544866330-95a6cc4b3f37?q=80&w=200&auto=format&fit=crop',
    casinoImage: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1200&auto=format&fit=crop',
    casinoName: 'Bellagio Monte Carlo',
    title: '100% Welcome Match up to $2,000',
    description: 'Double your first deposit and start your Riviera journey with extra bankroll on every table game.',
    validity: 'Valid until 31 Aug 2026',
    bonusDetails: '100% match on first deposit, up to $2,000. 20x wagering requirement.',
    benefits: ['Instant bonus credit', 'Valid on live tables', 'No max cashout cap'],
    ctaLabel: 'Claim Bonus',
  },
  {
    id: 'promo-002',
    casinoLogo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=200&auto=format&fit=crop',
    casinoImage: 'https://images.unsplash.com/photo-1518895312237-a9e23508077d?q=80&w=1200&auto=format&fit=crop',
    casinoName: 'Marina Bay Sands',
    title: 'Free Tournament Entry Ticket',
    description: 'Register this month and receive a complimentary entry to the Asia Pacific Poker Series.',
    validity: 'Valid until 15 Sep 2026',
    bonusDetails: 'One free tournament ticket worth $2,000 per new qualifying account.',
    benefits: ['No buy-in required', 'Transferable once', 'Includes hotel discount code'],
    ctaLabel: 'Get Ticket',
  },
  {
    id: 'promo-003',
    casinoLogo: 'https://images.unsplash.com/photo-1605902711622-cfb43c4437d1?q=80&w=200&auto=format&fit=crop',
    casinoImage: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?q=80&w=1200&auto=format&fit=crop',
    casinoName: 'Wynn Las Vegas',
    title: '20% Cashback on Slot Losses',
    description: 'Weekly cashback on net slot losses, credited automatically every Monday.',
    validity: 'Ongoing — reviewed monthly',
    bonusDetails: '20% cashback up to $1,000 per week, no wagering requirement.',
    benefits: ['Automatic credit', 'No wagering requirement', 'Stacks with VIP tier bonus'],
    ctaLabel: 'Activate Cashback',
  },
  {
    id: 'promo-004',
    casinoLogo: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=200&auto=format&fit=crop',
    casinoImage: 'https://images.unsplash.com/photo-1596838132330-1b31d6e5b1b3?q=80&w=1200&auto=format&fit=crop',
    casinoName: 'Casino de Baden',
    title: 'Roulette Cup Early-Bird Discount',
    description: 'Book your European High Stakes Roulette Cup seat early and save on entry.',
    validity: 'Valid until 20 Oct 2026',
    bonusDetails: '15% discount on tournament buy-in for bookings made 30 days in advance.',
    benefits: ['15% off entry', 'Priority seating', 'Complimentary welcome drink'],
    ctaLabel: 'Book Early',
  },
  {
    id: 'promo-005',
    casinoLogo: 'https://images.unsplash.com/photo-1611162458324-aae1eb4129a4?q=80&w=200&auto=format&fit=crop',
    casinoImage: 'https://images.unsplash.com/photo-1583067711998-c0d9c1a5bea9?q=80&w=1200&auto=format&fit=crop',
    casinoName: 'City of Dreams',
    title: 'VIP Suite Upgrade on Stay of 3+ Nights',
    description: 'Book three nights or more around the Millionaires Blackjack Night and receive a complimentary suite upgrade.',
    validity: 'Valid until 25 Nov 2026',
    bonusDetails: 'Free upgrade from Deluxe to Sky Suite, subject to availability.',
    benefits: ['Free room upgrade', 'Late checkout included', 'Sky21 rooftop access'],
    ctaLabel: 'Reserve Now',
  },
  {
    id: 'promo-006',
    casinoLogo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=200&auto=format&fit=crop',
    casinoImage: 'https://images.unsplash.com/photo-1601370552761-9d0f9b5c6b8b?q=80&w=1200&auto=format&fit=crop',
    casinoName: 'Casino Barcelona',
    title: 'Refer-a-Friend: $250 Each',
    description: 'Bring a friend to the Mediterranean Cash Game Festival and you both receive bonus chips.',
    validity: 'Ongoing',
    bonusDetails: '$250 in chips for both referrer and referee after first buy-in.',
    benefits: ['Unlimited referrals', 'Instant chip credit', 'Combinable with festival pass'],
    ctaLabel: 'Refer Now',
  },
]

/**
 * fetchPromotions
 * Currently resolves the local dummy dataset. Swap for a real API call
 * once the backend endpoint is available.
 */
export async function fetchPromotions() {
  return Promise.resolve(dummyPromotions)
}

// src/data/events.js
//
// Dummy data source for the Events page.
//
// ── Backend integration ───────────────────────────────────────────────────
// When your API is ready, replace the body of `fetchEvents()` with a real
// call and keep the same return shape (an array of event objects). No
// changes are required anywhere else — EventCard.jsx and Events.jsx already
// consume whatever this function resolves to.
//
//   export async function fetchEvents() {
//     const { data } = await axios.get('/api/events')
//     return data
//   }
//
// ────────────────────────────────────────────────────────────────────────────

export const dummyEvents = [
  {
    id: 'evt-001',
    banner: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1400&auto=format&fit=crop',
    casinoName: 'Bellagio Monte Carlo',
    title: 'Riviera Grand Slam Weekend',
    description:
      'A three-night takeover of the Bellagio Monte Carlo floor featuring exclusive tables, a champagne welcome, and a private VIP lounge overlooking the harbour.',
    country: 'Monaco',
    city: 'Monte Carlo',
    venue: 'Bellagio Monte Carlo — Grand Casino Hall',
    startDate: '2026-08-14',
    endDate: '2026-08-17',
    category: 'High Roller',
    entryRequirements: 'VIP Level 3+ or invitation. Valid passport required on arrival.',
    packages: [
      { name: 'Silver Access', price: '$1,200', includes: '2 nights hotel, floor access' },
      { name: 'Gold Access', price: '$3,500', includes: '3 nights suite, VIP lounge, $500 chips' },
      { name: 'Platinum Access', price: '$8,900', includes: 'Penthouse suite, private table, concierge' },
    ],
    contact: { name: 'Elena Voss', email: 'events@jackpotsworld.com', phone: '+377 98 06 12 34' },
  },
  {
    id: 'evt-002',
    banner: 'https://images.unsplash.com/photo-1518895312237-a9e23508077d?q=80&w=1400&auto=format&fit=crop',
    casinoName: 'Marina Bay Sands',
    title: 'Asia Pacific Poker & Baccarat Series',
    description:
      'The region\'s premier baccarat and poker crossover event, bringing together top-tier players from across Asia for a week of high-stakes competition.',
    country: 'Singapore',
    city: 'Singapore',
    venue: 'Marina Bay Sands — Sands Skypark Casino',
    startDate: '2026-09-02',
    endDate: '2026-09-08',
    category: 'Tournament',
    entryRequirements: 'Buy-in required. Age 21+. Government-issued ID mandatory.',
    packages: [
      { name: 'Spectator Pass', price: '$150', includes: 'Floor access, welcome drink' },
      { name: 'Player Entry', price: '$2,000', includes: 'Tournament buy-in, hotel stay' },
    ],
    contact: { name: 'Marcus Tan', email: 'apac@jackpotsworld.com', phone: '+65 6688 8888' },
  },
  {
    id: 'evt-003',
    banner: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?q=80&w=1400&auto=format&fit=crop',
    casinoName: 'Wynn Las Vegas',
    title: 'Desert Nights Gala & Slots Invitational',
    description:
      'An exclusive invitation-only evening combining a black-tie gala dinner with a high-limit slots invitational and live entertainment.',
    country: 'United States',
    city: 'Las Vegas',
    venue: 'Wynn Las Vegas — Encore Salon',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    category: 'Gala',
    entryRequirements: 'Black-tie dress code. Invitation or VIP Level 2+.',
    packages: [
      { name: 'Gala Only', price: '$650', includes: 'Dinner, entertainment' },
      { name: 'Full Weekend', price: '$2,400', includes: 'Gala, 2 nights suite, slots credit' },
    ],
    contact: { name: 'Ashley Rome', email: 'vegas@jackpotsworld.com', phone: '+1 702 555 0134' },
  },
  {
    id: 'evt-004',
    banner: 'https://images.unsplash.com/photo-1596838132330-1b31d6e5b1b3?q=80&w=1400&auto=format&fit=crop',
    casinoName: 'Casino de Baden',
    title: 'European High Stakes Roulette Cup',
    description:
      'A refined roulette-only tournament held in the historic halls of Casino de Baden, with a guaranteed prize pool and daily elimination rounds.',
    country: 'Germany',
    city: 'Baden-Baden',
    venue: 'Casino de Baden — Red Room',
    startDate: '2026-11-05',
    endDate: '2026-11-07',
    category: 'Tournament',
    entryRequirements: 'Buy-in required. Smart formal attire.',
    packages: [
      { name: 'Standard Entry', price: '€900', includes: 'Tournament entry, 2 rounds' },
      { name: 'VIP Entry', price: '€2,600', includes: 'Priority table, hotel, hospitality suite' },
    ],
    contact: { name: 'Johann Krause', email: 'europe@jackpotsworld.com', phone: '+49 7221 21060' },
  },
  {
    id: 'evt-005',
    banner: 'https://images.unsplash.com/photo-1583067711998-c0d9c1a5bea9?q=80&w=1400&auto=format&fit=crop',
    casinoName: 'City of Dreams',
    title: 'Macau Millionaires Blackjack Night',
    description:
      'A single-night blackjack spectacular with celebrity dealers, a $1M guaranteed prize pool, and after-party access on the Sky21 rooftop.',
    country: 'China (Macau SAR)',
    city: 'Macau',
    venue: 'City of Dreams — Sky Casino',
    startDate: '2026-12-01',
    endDate: '2026-12-01',
    category: 'High Roller',
    entryRequirements: 'Minimum buy-in $5,000. VIP Level 4+ recommended.',
    packages: [
      { name: 'Table Seat', price: '$5,000', includes: 'Guaranteed seat, welcome package' },
      { name: 'Sky Suite Package', price: '$15,000', includes: 'Table seat, suite, after-party VIP' },
    ],
    contact: { name: 'Sophia Lam', email: 'macau@jackpotsworld.com', phone: '+853 8868 6868' },
  },
  {
    id: 'evt-006',
    banner: 'https://images.unsplash.com/photo-1601370552761-9d0f9b5c6b8b?q=80&w=1400&auto=format&fit=crop',
    casinoName: 'Casino Barcelona',
    title: 'Mediterranean Cash Game Festival',
    description:
      'Five days of rotating cash games across every major format, set against the backdrop of Barcelona\'s marina and old town.',
    country: 'Spain',
    city: 'Barcelona',
    venue: 'Casino Barcelona — Port Vell',
    startDate: '2027-01-18',
    endDate: '2027-01-23',
    category: 'Cash Game Festival',
    entryRequirements: 'Open entry. Table minimums vary by room.',
    packages: [
      { name: 'Day Pass', price: '€120', includes: 'Floor access for 1 day' },
      { name: 'Festival Pass', price: '€550', includes: 'All 5 days, welcome dinner' },
    ],
    contact: { name: 'Nuria Alvarez', email: 'barcelona@jackpotsworld.com', phone: '+34 932 25 78 78' },
  },
]

/**
 * fetchEvents
 * Currently resolves the local dummy dataset. Swap the body for an axios
 * call (see comment block above) once the backend endpoint is live.
 */
export async function fetchEvents() {
  return Promise.resolve(dummyEvents)
}

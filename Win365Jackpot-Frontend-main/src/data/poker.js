// src/data/poker.js
//
// Dummy data source for the Poker page.
//
// ── Backend integration ───────────────────────────────────────────────────
// Swap the body of `fetchPokerEvents()` for a real call once ready:
//
//   export async function fetchPokerEvents() {
//     const { data } = await axios.get('/api/poker-events')
//     return data
//   }
//
// ────────────────────────────────────────────────────────────────────────────

export const dummyPokerEvents = [
  {
    id: 'poker-001',
    title: 'Asia Pacific Poker Championship — Main Event',
    casino: 'Marina Bay Sands',
    status: 'upcoming', // 'upcoming' | 'live'
    buyIn: '$2,000',
    prizePool: '$1,200,000 GTD',
    date: '2026-09-04',
    venue: 'Marina Bay Sands — Sands Skypark Casino',
    seatsAvailable: 48,
  },
  {
    id: 'poker-002',
    title: 'Riviera High Roller Invitational',
    casino: 'Bellagio Monte Carlo',
    status: 'upcoming',
    buyIn: '$10,000',
    prizePool: '$800,000 GTD',
    date: '2026-08-16',
    venue: 'Bellagio Monte Carlo — Grand Casino Hall',
    seatsAvailable: 12,
  },
  {
    id: 'poker-003',
    title: 'Wynn Nightly Turbo Series',
    casino: 'Wynn Las Vegas',
    status: 'live',
    buyIn: '$500',
    prizePool: '$45,000 GTD',
    date: '2026-07-01',
    venue: 'Wynn Las Vegas — Encore Salon',
    seatsAvailable: 6,
  },
  {
    id: 'poker-004',
    title: 'Baden-Baden Autumn Classic',
    casino: 'Casino de Baden',
    status: 'upcoming',
    buyIn: '€1,500',
    prizePool: '€300,000 GTD',
    date: '2026-11-06',
    venue: 'Casino de Baden — Red Room',
    seatsAvailable: 64,
  },
  {
    id: 'poker-005',
    title: 'Macau Millionaires Poker Side Event',
    casino: 'City of Dreams',
    status: 'upcoming',
    buyIn: '$3,000',
    prizePool: '$500,000 GTD',
    date: '2026-12-02',
    venue: 'City of Dreams — Sky Casino',
    seatsAvailable: 30,
  },
  {
    id: 'poker-006',
    title: 'Barcelona Marina Cash Game Rush',
    casino: 'Casino Barcelona',
    status: 'live',
    buyIn: '€300',
    prizePool: '€60,000 GTD',
    date: '2026-07-01',
    venue: 'Casino Barcelona — Port Vell',
    seatsAvailable: 4,
  },
]

/**
 * fetchPokerEvents
 * Currently resolves the local dummy dataset. Swap for a real API call
 * once the backend endpoint is available.
 */
export async function fetchPokerEvents() {
  return Promise.resolve(dummyPokerEvents)
}

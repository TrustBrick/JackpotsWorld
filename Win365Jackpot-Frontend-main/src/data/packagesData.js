// Shared package tier data — used by the landing-page CountryPackages
// component and the User Panel's Packages tab, so both stay in sync.

export const WHATSAPP_NUMBER = '917795281999'

export const PACKAGES = [
  {
    name: 'VIP', price: '$5,000', icon: '🃏', color: '#9E9E9E', badge: null,
    duration: '3 Nights', flight: 'Economy', hotel: 'Standard 3★ (3N)',
    food: 'Casino', liquor: 'Over the Gaming Table (Local)',
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: false, shoppingVoucher: false, visa: false,
  },
  {
    name: 'Classic', price: '$10,000', icon: '🎴', color: '#78909C', badge: null,
    duration: '3 Nights', flight: 'Economy', hotel: 'Standard 4★ (3N)',
    food: 'Casino', liquor: 'Over the Gaming Table (Local Premium)',
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: true, shoppingVoucher: false, visa: true,
  },
  {
    name: 'Premium', price: '$15,000', icon: '🎲', color: '#D4AF37', badge: 'Popular',
    duration: '3 Nights', flight: 'Economy', hotel: 'Standard 5★ (3N)',
    food: 'Casino', liquor: 'Over the Gaming Table (Premium)',
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: true, shoppingVoucher: false, visa: true,
  },
  {
    name: 'Prestige', price: '$20,000', icon: '🏆', color: '#F5A623', badge: null,
    duration: '3 Nights', flight: 'Economy', hotel: 'Executive 5★ (3N)',
    food: 'Casino', liquor: 'Over the Gaming Table (Imported Premium)',
    airportVIP: false, jackpotRewards: true, vipTransport: false,
    spa: true, shoppingVoucher: false, visa: true,
  },
  {
    name: 'Signature', price: '$25,000', icon: '✍️', color: '#26C6DA', badge: null,
    duration: '3 Nights', flight: 'Economy', hotel: 'Premium 5★ (3N)',
    food: 'Casino', liquor: 'Over the Gaming Table (Imported Premium)',
    airportVIP: true, jackpotRewards: true, vipTransport: true,
    spa: true, shoppingVoucher: true, visa: true,
  },
  {
    name: 'Elite', price: '$50,000', icon: '💎', color: '#B9F2FF', badge: 'Best Value',
    duration: '3 Nights', flight: 'Business', hotel: 'Suite 5★ (3N)',
    food: 'Casino/Hotel', liquor: 'Imported Premium',
    airportVIP: true, jackpotRewards: true, vipTransport: true, vipTransportNote: '*',
    spa: true, spaNote: '*', shoppingVoucher: true, shoppingNote: '*', visa: true,
  },
  {
    name: 'Royal', price: '$100,000', icon: '👑', color: '#FFD700', badge: null,
    duration: '4 Nights', flight: 'Business', hotel: 'Executive Suite 5★ (4N)',
    food: 'Casino/Hotel', liquor: 'Imported Premium',
    airportVIP: true, jackpotRewards: true, vipTransport: true, vipTransportNote: '**',
    spa: true, spaNote: '**', shoppingVoucher: true, shoppingNote: '**', visa: true,
  },
  {
    name: 'Sovereign', price: '$250,000+', icon: '⚜️', color: '#C9A84C', badge: '🤫 Invite Only',
    duration: '7 Nights', flight: 'Business', hotel: 'Presidential Suite (7N)',
    food: 'Casino/Hotel', liquor: 'Imported Premium',
    airportVIP: true, jackpotRewards: true, vipTransport: true, vipTransportNote: '**',
    spa: true, spaNote: '***', shoppingVoucher: true, shoppingNote: '***', visa: true,
  },
]

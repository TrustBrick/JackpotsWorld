// Shared between the public marketing page (src/pages/Affiliates.jsx) and the
// authenticated Affiliate Portal's Commission tab, so both always show the
// same numbers. Copy-only content today — see Affiliates.jsx for the note on
// moving this to an admin-editable API later.
export const commissionTiers = [
  { tier: 'Starter', referrals: '1 – 10 active players', rate: '15% revenue share' },
  { tier: 'Growth', referrals: '11 – 50 active players', rate: '20% revenue share' },
  { tier: 'Elite', referrals: '51 – 150 active players', rate: '25% revenue share' },
  { tier: 'Legacy', referrals: '150+ active players', rate: '30% revenue share' },
]

/**
 * AFFILIATE-LEVELS — the ladder every affiliate climbs, lowest first.
 *
 * Mirrors AffiliateProfile.LEVEL_CHOICES in
 * authapp/models/affiliate_models.py: the `id`s must match the backend
 * values. Every affiliate joins at VIP. The admin sets the level for now
 * (Back Office → Affiliates); the conditions for moving up come later.
 *
 * Shared by the admin Affiliates tab and the affiliate dashboard so the two
 * can never show a level in different colours.
 */
export const AFFILIATE_LEVELS = [
  { id: "vip",     label: "VIP",     color: "#A78BFA" },
  { id: "bronze",  label: "Bronze",  color: "#CD7F32" },
  { id: "silver",  label: "Silver",  color: "#C0C7D1" },
  { id: "gold",    label: "Gold",    color: "#D4AF37" },
  { id: "diamond", label: "Diamond", color: "#67E8F9" },
];

export const affiliateLevel = (id) =>
  AFFILIATE_LEVELS.find(l => l.id === id) || AFFILIATE_LEVELS[0];

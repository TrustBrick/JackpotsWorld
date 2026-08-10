// Reward-type -> icon mapping for both Signup Wheel and Bonus Wheel.
// Real lucide-react vector icons (the icon library already used everywhere
// else in this app) instead of pre-rendered raster icons — they stay crisp
// at any wheel size and recolor for free via CSS `color`, so only the ring/
// hub/pointer (which need real material/lighting rendering CSS can't match)
// are pre-rendered PNGs — see public/images/wheel/.
import {
  DollarSign, Percent, TrendingUp, Crown, Gift, Package, Building2, CalendarDays,
  Ticket, Plane, Tag, RotateCw, RotateCcw, HelpCircle,
} from "lucide-react";

export const REWARD_TYPE_ICON = {
  cash_bonus: DollarSign,
  cashback: Percent,
  rolling_points: TrendingUp,
  vip_points: Crown,
  gift_voucher: Gift,
  merchandise: Package,
  hotel_stay: Building2,
  event_ticket: CalendarDays,
  casino_coupon: Ticket,
  free_travel: Plane,
  discount: Tag,
  free_spins: RotateCw,
  physical_gift: Gift,
  mystery_reward: HelpCircle,
  no_reward: RotateCcw,
};

export function iconFor(rewardType) {
  return REWARD_TYPE_ICON[rewardType] || Gift;
}

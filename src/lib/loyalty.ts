// Loyalty Engine - Tier calculation and discount rules

export const LOYALTY_TIERS = {
  bronze: { minVisits: 0, maxDiscountPercent: 10, label: "Bronce" },
  silver: { minVisits: 10, maxDiscountPercent: 20, label: "Plata" },
  gold: { minVisits: 30, maxDiscountPercent: 33.33, label: "Oro" },
} as const;

export type LoyaltyTier = keyof typeof LOYALTY_TIERS;

export function calculateTier(purchaseCount: number): LoyaltyTier {
  if (purchaseCount >= 30) return "gold";
  if (purchaseCount >= 10) return "silver";
  return "bronze";
}

// Max discount = min(tierMax, margin/3)
// margin = price - cost
export function calculateMaxDiscount(
  price: number,
  cost: number,
  tier: LoyaltyTier
): number {
  const margin = price - cost;
  if (margin <= 0) return 0;

  const tierConfig = LOYALTY_TIERS[tier];
  const tierLimit = (margin * tierConfig.maxDiscountPercent) / 100;
  const absoluteLimit = margin / 3;

  return Math.min(tierLimit, absoluteLimit);
}

export function getTierLabel(tier: LoyaltyTier): string {
  return LOYALTY_TIERS[tier].label;
}

export function getNextTier(purchaseCount: number): LoyaltyTier | null {
  if (purchaseCount < 10) return "silver";
  if (purchaseCount < 30) return "gold";
  return null;
}

export function getVisitsNeededForNextTier(purchaseCount: number): number {
  if (purchaseCount < 10) return 10 - purchaseCount;
  if (purchaseCount < 30) return 30 - purchaseCount;
  return 0;
}

export function calculateTierProgress(purchaseCount: number): number {
  if (purchaseCount < 10) return (purchaseCount / 10) * 100;
  if (purchaseCount < 30) return ((purchaseCount - 10) / 20) * 100;
  return 100;
}

// Hash a fingerprint string (simulated for now)
export async function hashFingerprint(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

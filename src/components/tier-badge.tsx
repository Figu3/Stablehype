"use client";

import { Badge } from "@/components/ui/badge";
import { TIER_META, type TierLevel } from "@/lib/tiers";

interface TierBadgeProps {
  tier: TierLevel;
  size?: "sm" | "md";
}

export function TierBadge({ tier, size = "sm" }: TierBadgeProps) {
  const meta = TIER_META[tier];
  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5 gap-1"
    : "text-xs px-2 py-0.5 gap-1.5";

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center font-semibold font-mono ${sizeClasses} ${meta.bgClass}`}
      title={meta.description}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {tier}
    </Badge>
  );
}

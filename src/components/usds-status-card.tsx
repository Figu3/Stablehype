"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsdsStatus } from "@/hooks/use-usds-status";

function formatLastChecked(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UsdsStatusCard() {
  const { data: status, isLoading } = useUsdsStatus();

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-l-[3px] border-l-violet-500">
        <CardHeader className="pb-1">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-20" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-violet-500">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            USDS Freeze Status
          </CardTitle>
          {status.freezeActive ? (
            <Badge variant="destructive" className="text-xs">Active</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Not Active</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Sky (ex-MakerDAO) can enable freeze via governance vote
        </p>
        <p className="text-xs text-muted-foreground">
          Last checked: {formatLastChecked(status.lastChecked)}
        </p>
      </CardContent>
    </Card>
  );
}

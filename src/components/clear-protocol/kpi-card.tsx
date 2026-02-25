import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function KPICard({
  label,
  value,
  sub,
  accent,
  isLoading,
  isZeroGood,
  placeholder,
}: {
  label: string;
  value: string | null;
  sub?: string;
  accent: "blue" | "violet" | "emerald" | "green";
  isLoading: boolean;
  isZeroGood?: boolean;
  placeholder?: string;
}) {
  const borderColor = {
    blue: "border-l-blue-500",
    violet: "border-l-violet-500",
    emerald: "border-l-emerald-500",
    green: "border-l-emerald-500",
  }[accent];

  return (
    <Card className={`border-l-[3px] ${borderColor}`}>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-24 bg-muted/50 rounded animate-pulse" />
        ) : (
          <div className="text-2xl font-bold font-mono tracking-tight">
            {value ?? placeholder ?? "\u2014"}
          </div>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {isZeroGood && value === "0" && (
            <span className="inline-flex items-center gap-0.5 text-xs text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />
              All at peg
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

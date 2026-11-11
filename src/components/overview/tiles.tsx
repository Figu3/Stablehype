import Link from "next/link";
import type { ReactNode } from "react";

/** What a tile shows when its figure is not known. Never a zero. */
export const UNKNOWN = "-";
export const GRID = "grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3";

export function Tile({ label, value, note, loading }: { label: string; value: string; note: string; loading: boolean }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {loading ? (
        <div className="mt-1 h-7 w-24 bg-muted/50 rounded animate-pulse" />
      ) : (
        <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${value === UNKNOWN ? "text-muted-foreground" : ""}`}>{value}</div>
      )}
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

export function Section({ title, intro, href, link, children }: {
  title: string; intro: string; href?: string; link?: string; children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{intro}</p>
        </div>
        {href && <Link href={href} className="text-sm text-violet-500 hover:underline whitespace-nowrap">{link} →</Link>}
      </div>
      {children}
    </section>
  );
}

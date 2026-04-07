import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface AiSummaryProps {
  title: string;
  text: string;
  updatedAt: string;
}

/**
 * Editorial summary card for a stablecoin detail page.
 *
 * Renders only when an entry exists in `data/ai-summaries.json` keyed
 * by the coin's id. The summary is hand-curated content intended to
 * give context that pure metrics can't convey.
 */
export function AiSummary({ title, text, updatedAt }: AiSummaryProps) {
  const dateline = new Date(`${updatedAt}T00:00:00`).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle as="h2" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Updated {dateline}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-serif text-[1.05rem] leading-relaxed text-foreground/90 italic">
          {text}
        </p>
      </CardContent>
    </Card>
  );
}

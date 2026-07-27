"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";

const MAX_COINS = 5;

interface CompareCoinPickerProps {
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  logos: Record<string, string> | undefined;
}

export function CompareCoinPicker({ selectedIds, onAdd, onRemove, logos }: CompareCoinPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const atMax = selectedIds.length >= MAX_COINS;

  const results = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase().trim();
    const pool = TRACKED_STABLECOINS.filter((s) => !selectedSet.has(s.id));
    const matches = q
      ? pool.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.symbol.toLowerCase().includes(q) ||
            s.id === q
        )
      : pool;
    return matches.slice(0, 20);
  }, [open, query, selectedSet]);

  function handleSelect(id: string) {
    onAdd(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id) => {
            const meta = TRACKED_STABLECOINS.find((s) => s.id === id);
            if (!meta) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-2 rounded-full border bg-muted/50 py-1 pl-1.5 pr-2 text-sm font-medium"
              >
                <StablecoinLogo src={logos?.[id]} name={meta.name} size={18} />
                {meta.symbol}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  aria-label={`Remove ${meta.symbol}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {atMax ? (
        <p className="text-xs text-muted-foreground">
          Maximum of {MAX_COINS} coins selected. Remove one to add another.
        </p>
      ) : (
        <div className="relative max-w-sm">
          <Input
            placeholder="Search by name or symbol..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
          />
          {open && results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(s.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  <StablecoinLogo src={logos?.[s.id]} name={s.name} size={18} />
                  <span className="font-medium">{s.symbol}</span>
                  <span className="text-muted-foreground truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}
          {open && query && results.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
              No matches.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { MAX_COINS };

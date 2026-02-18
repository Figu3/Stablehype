"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_LINKS } from "@/lib/constants";

export function CategoryNav() {
  const searchParams = useSearchParams();

  return (
    <nav aria-label="Browse by category" className="flex flex-wrap gap-2 pt-1">
      {CATEGORY_LINKS.map((cat) => {
        const isActive = searchParams.get(cat.param) === cat.value;
        return (
          <Link
            key={cat.href}
            href={cat.href}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              isActive
                ? "bg-foreground text-background border-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {cat.label}
          </Link>
        );
      })}
    </nav>
  );
}

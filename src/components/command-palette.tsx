"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Title as DialogTitle } from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowRightLeft,
  BookOpen,
  Coins,
  Droplets,
  Gauge,
  HeartPulse,
  History,
} from "lucide-react";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";
import { useLogos } from "@/hooks/use-logos";
import { StablecoinLogo } from "@/components/stablecoin-logo";

const PAGES = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/depegs/", label: "Depeg History", icon: History },
  { href: "/flows/", label: "Supply Flows", icon: Droplets },
  { href: "/compare/", label: "Compare Stablecoins", icon: ArrowRightLeft },
  { href: "/methodology/", label: "Methodology", icon: BookOpen },
  { href: "/status/", label: "Data Status", icon: HeartPulse },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: logos } = useLogos();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Site search"
      contentClassName="fixed left-1/2 top-[20%] z-[100] w-[90vw] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-background shadow-2xl"
      overlayClassName="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
    >
      <DialogTitle className="sr-only">Site search</DialogTitle>
      <Command.Input
        placeholder="Jump to a stablecoin or page…"
        className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          No results.
        </Command.Empty>

        <Command.Group
          heading="Pages"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          {PAGES.map((p) => (
            <Command.Item
              key={p.href}
              value={`page ${p.label}`}
              onSelect={() => go(p.href)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <p.icon className="h-4 w-4 text-muted-foreground" />
              {p.label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group
          heading="Stablecoins"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          {TRACKED_STABLECOINS.map((s) => (
            <Command.Item
              key={s.id}
              value={`${s.symbol} ${s.name}`}
              onSelect={() => go(`/stablecoin/${s.id}/`)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <StablecoinLogo src={logos?.[s.id]} name={s.name} size={18} />
              <span className="font-medium">{s.symbol}</span>
              <span className="text-xs text-muted-foreground">{s.name}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <Coins className="mr-1 inline h-3 w-3" />
          {TRACKED_STABLECOINS.length} coins
        </span>
        <span className="flex items-center gap-2">
          <Gauge className="h-3 w-3" />
          <kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd> navigate ·{" "}
          <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd> open ·{" "}
          <kbd className="rounded border bg-muted px-1 font-mono">esc</kbd> close
        </span>
      </div>
    </Command.Dialog>
  );
}

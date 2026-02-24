"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { useClearMode } from "@/components/clear-mode-context";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/depegs/", label: "Depegs" },
  { href: "/routes/", label: "Routes", clearOnly: true },
] as const;

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { clearMode, toggleClearMode } = useClearMode();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <Image src="/icon-300.png" alt="StableHype" width={32} height={32} className="rounded-lg" priority />
            <span className="text-lg font-semibold tracking-tight">StableHype</span>
          </Link>
          {/* Desktop nav */}
          <nav aria-label="Main navigation" className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.filter((item) => !("clearOnly" in item && item.clearOnly) || clearMode).map((item) => {
              const isActive = item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={clearMode ? "default" : "outline"}
            size="sm"
            onClick={toggleClearMode}
            className={`shrink-0 gap-1.5 text-xs h-8 ${clearMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${clearMode ? "bg-white" : "bg-red-500"}`} />
            Clear Mode
          </Button>
          <ThemeToggle />
          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <SheetDescription className="sr-only">Site navigation links</SheetDescription>
              <div className="flex flex-col gap-1 pt-8">
                {NAV_ITEMS.filter((item) => !("clearOnly" in item && item.clearOnly) || clearMode).map((item) => {
                  const isActive = item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                        isActive
                          ? "text-foreground bg-accent"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-8 border-t pt-6">
                <p className="text-xs text-muted-foreground">
                  Real-time analytics for 118+ stablecoins
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

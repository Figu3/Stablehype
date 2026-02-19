"use client";

import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <Image src="/icon-300.png" alt="StableHype" width={32} height={32} className="rounded-lg" priority />
          <span className="text-lg font-semibold tracking-tight">StableHype</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

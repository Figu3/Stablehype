import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import KeeperClient from "./client";
import { KeeperGasSkeleton } from "@/components/keeper-gas-dashboard";

export const metadata: Metadata = {
  title: "Oracle Keeper Gas · Clear",
  description:
    "Track gas costs and runway for the Clear Protocol oracle keeper on Ethereum mainnet.",
  alternates: { canonical: "/routes/keeper/" },
};

export default function KeeperPage() {
  return (
    <>
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/routes" className="hover:text-foreground transition-colors">
            Clear Routes
          </Link>
          <span>/</span>
          <span className="text-foreground">Keeper Gas</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Oracle Keeper Gas</h1>
          <p className="text-sm text-muted-foreground">
            Gas costs, runway estimation, and transaction history for the Clear
            Protocol v0.2 oracle keeper.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <Suspense
          fallback={
            <div className="space-y-6">
              <KeeperGasSkeleton />
            </div>
          }
        >
          <KeeperClient />
        </Suspense>
      </div>
    </>
  );
}

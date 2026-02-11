import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StablecoinCemetery } from "@/components/stablecoin-cemetery";

export default function CemeteryPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Stablecoin Cemetery</h1>
        <p className="text-sm text-muted-foreground">
          Defunct, depegged, and discontinued. A memorial to fallen stablecoins.
        </p>
      </div>

      <StablecoinCemetery />
    </div>
  );
}

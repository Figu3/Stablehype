import Link from "next/link";

const CATEGORY_LINKS = [
  { href: "/?type=centralized", label: "CeFi Stablecoins" },
  { href: "/?type=centralized-dependent", label: "CeFi-Dependent" },
  { href: "/?type=decentralized", label: "DeFi Stablecoins" },
  { href: "/?backing=rwa-backed", label: "RWA-Backed" },
  { href: "/?backing=crypto-backed", label: "Crypto-Backed" },
  { href: "/?peg=eur-peg", label: "EUR Stablecoins" },
  { href: "/?peg=gold-peg", label: "Gold-Backed" },
  { href: "/?features=yield-bearing", label: "Yield-Bearing" },
];

export function Footer() {
  return (
    <footer className="border-t py-6">
      <div className="container mx-auto px-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
            <Link href="/peg-tracker" className="hover:text-foreground transition-colors">Peg Tracker</Link>
            <Link href="/blacklist" className="hover:text-foreground transition-colors">Freeze Tracker</Link>
            <Link href="/cemetery" className="hover:text-foreground transition-colors">Cemetery</Link>
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          </nav>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Data from DefiLlama, CoinGecko, DexScreener, Etherscan &amp; TronGrid</span>
            <span className="text-muted-foreground/50">|</span>
            <span className="font-mono">Watching the peg.</span>
          </div>
        </div>
        <nav aria-label="Browse by category" className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          {CATEGORY_LINKS.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="hover:text-foreground transition-colors"
            >
              {cat.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

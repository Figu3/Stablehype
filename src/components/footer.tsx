import Image from "next/image";
import Link from "next/link";
import { Github, Twitter } from "lucide-react";

const DATA_SOURCES = [
  { name: "DefiLlama", href: "https://defillama.com" },
  { name: "CoinGecko", href: "https://coingecko.com" },
  { name: "DexScreener", href: "https://dexscreener.com" },
];

const SOCIAL_LINKS = [
  { icon: Github, href: "https://github.com/stablehype", label: "GitHub" },
  { icon: Twitter, href: "https://x.com/stablehype", label: "X / Twitter" },
];

export function Footer() {
  return (
    <footer className="border-t bg-card/50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Brand + tagline */}
          <div className="flex flex-col gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <Image
                src="/icon-300.png"
                alt="StableHype"
                width={20}
                height={20}
                className="rounded opacity-60 group-hover:opacity-100 transition-opacity"
              />
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                StableHype
              </span>
            </Link>
            <p className="text-xs text-muted-foreground/70 max-w-xs">
              Real-time peg monitoring and analytics for stablecoins across every chain.
            </p>
          </div>

          {/* Data sources */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Data Sources
            </span>
            <div className="flex items-center gap-3">
              {DATA_SOURCES.map((src) => (
                <a
                  key={src.name}
                  href={src.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {src.name}
                </a>
              ))}
            </div>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-all"
              >
                <link.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            © {new Date().getFullYear()} StableHype. Not financial advice.
          </p>
          <p className="text-[10px] text-muted-foreground/50">
            Built with data from DefiLlama, CoinGecko, DexScreener, Etherscan &amp; TronGrid
          </p>
        </div>
      </div>
    </footer>
  );
}

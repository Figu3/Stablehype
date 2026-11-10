import Image from "next/image";
import Link from "next/link";
import { Github, Twitter } from "lucide-react";

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
            <p className="text-xs text-muted-foreground max-w-xs">
              Clear Protocol analytics: reserves, swaps, rebalances and oracle health.
            </p>
          </div>

          {/* Transparency */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Transparency
            </span>
            <div className="flex items-center gap-3">
              <Link
                href="/methodology/"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Methodology
              </Link>
              <Link
                href="/status/"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Data Status
              </Link>
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
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} StableHype. Not financial advice.
          </p>
          <p className="text-xs text-muted-foreground">
            Clear figures are read from Ethereum mainnet
          </p>
        </div>
      </div>
    </footer>
  );
}

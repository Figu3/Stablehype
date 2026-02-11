import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <Image
        src="/fenrir-icon.png"
        alt="Fenrir"
        width={120}
        height={120}
        className="opacity-20"
      />
      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold font-mono tracking-tight">404</h1>
        <p className="text-muted-foreground font-mono">Trail gone cold.</p>
      </div>
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

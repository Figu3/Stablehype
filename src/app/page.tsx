import { Suspense } from "react";
import { HomepageClient } from "@/components/homepage-client";

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full bg-frost-blue/30 animate-hype-pulse" />
      </div>
    }>
      <HomepageClient />
    </Suspense>
  );
}

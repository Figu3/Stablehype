import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Live Stablecoin Supply Tracker',
  description: 'Real-time tracking of all stablecoin supplies powered by DeFi Llama API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

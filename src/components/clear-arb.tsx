"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClearV1Arb, type ClearV1ArbStats } from "@/hooks/use-clear-v1";
import { formatAge, formatUSD } from "@/components/clear-protocol/format";
import { useNowSeconds } from "@/components/clear-protocol/v1/use-now";
import { ACTOR_TAG_CLASS, shortAddr } from "@/components/clear-protocol/v1/helpers";

const NO_DATA = "-";
const bps = (v: number | null) => (v === null ? NO_DATA : `${v.toFixed(2)} bps`);
/** Signed dollars that keep their cents: one arb makes cents, not thousands. */
const usd = (v: number) => {
  const abs = Math.abs(v);
  return `${v < 0 ? "-" : ""}${abs < 1000 ? `$${abs.toFixed(2)}` : formatUSD(abs)}`;
};
const tone = (v: number) => (v < 0 ? "text-rose-500" : "");

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold font-mono tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** A bot's profit is known once its receipts are read: until then show how far along that is. */
const profitCell = (s: ClearV1ArbStats) => (s.profitTxs === 0 ? NO_DATA : usd(s.botNetUsd));

export function ClearArb() {
  const { data, isError } = useClearV1Arb();
  const now = useNowSeconds();
  if (isError && !data) return <p className="text-sm text-muted-foreground">Arb data unavailable</p>;
  if (!data) return <div className="h-40 rounded-xl border bg-card animate-pulse" />;
  if (data.bots.length === 0) return <p className="text-sm text-muted-foreground">No bot swap yet</p>;

  const t = data.totals;
  const pending = t.txs - t.profitTxs;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Bot swaps" value={String(t.txs)} sub={`${data.bots.length} addresses · ${formatUSD(t.volumeUsd)} volume`} />
        <Tile label="Bots kept, after gas" value={profitCell(t)} sub={`${bps(t.botNetBps)} · ${usd(t.botGasUsd)} gas`} />
        <Tile label="Clear earned" value={usd(t.protocolUsd + t.rebalancerUsd)} sub="protocol plus rebalancer" />
        <Tile label="Protocol" value={usd(t.protocolUsd)} sub={`${bps(t.protocolBps)} · treasury ${usd(t.treasuryUsd)}, LPs ${usd(t.lpUsd)}`} />
        <Tile label="Rebalancer" value={usd(t.rebalancerUsd)} sub={`${bps(t.rebalancerBps)} · before its exit cost`} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead className="text-right">Txs</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">Bot profit</TableHead>
              <TableHead className="text-right">Bot bps</TableHead>
              <TableHead className="text-right">Protocol</TableHead>
              <TableHead className="text-right">Protocol bps</TableHead>
              <TableHead className="text-right">Rebalancer</TableHead>
              <TableHead className="text-right">Rebalancer bps</TableHead>
              <TableHead className="text-right">Last swap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.bots.map((b) => (
              <TableRow key={b.address}>
                <TableCell>
                  <a
                    href={`https://etherscan.io/address/${b.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs hover:underline"
                  >
                    {shortAddr(b.address)}
                  </a>
                  <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${b.known ? ACTOR_TAG_CLASS.mev : "bg-muted text-muted-foreground"}`}>
                    {b.label}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">{b.txs}</TableCell>
                <TableCell className="text-right font-mono">{formatUSD(b.volumeUsd)}</TableCell>
                <TableCell className={`text-right font-mono ${tone(b.botNetUsd)}`}>
                  {profitCell(b)}
                  {b.profitTxs > 0 && b.profitTxs < b.txs && <span className="text-muted-foreground"> ({b.profitTxs}/{b.txs})</span>}
                </TableCell>
                <TableCell className={`text-right font-mono ${tone(b.botNetUsd)}`}>{bps(b.botNetBps)}</TableCell>
                <TableCell className="text-right font-mono">{usd(b.protocolUsd)}</TableCell>
                <TableCell className="text-right font-mono">{bps(b.protocolBps)}</TableCell>
                <TableCell className={`text-right font-mono ${tone(b.rebalancerUsd)}`}>{usd(b.rebalancerUsd)}</TableCell>
                <TableCell className={`text-right font-mono ${tone(b.rebalancerUsd)}`}>{bps(b.rebalancerBps)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{formatAge(now - b.lastTimestamp)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground max-w-3xl">
        <p>
          <span className="text-foreground">Bot profit</span> is what the bot&apos;s own addresses hold more of at the end of each
          transaction (WETH at the Chainlink price of that block, stablecoins and its IOU rebate at $1), less gas. It covers the
          whole arbitrage, not only the Clear leg. A payment made to the block builder inside the transaction is not visible and
          is not deducted.{pending > 0 && ` Profit is still being read for ${pending} of ${t.txs} transactions.`}
        </p>
        <p>
          <span className="text-foreground">Protocol</span> is the IOUs minted to the treasury and to liquidity providers on these
          swaps. <span className="text-foreground">Rebalancer</span> is the rest of the spread: Clear books the token it receives at
          its redemption price, and whoever rebalances takes it out at that price. It is earned only if that token is then
          converted at par, and is shown before the cost of doing so. Bps are over the volume of the swaps.
        </p>
        <p>
          A bot is a tagged address, or a sender that calls itself, which is how these bots work, each on a fresh address. A
          person swapping from a smart wallet the same way is counted as a bot until tagged.
        </p>
      </div>
    </div>
  );
}

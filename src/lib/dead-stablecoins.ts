import type { CauseOfDeath, DeadStablecoin } from "./types";

export const CAUSE_META: Record<CauseOfDeath, { label: string; color: string }> = {
  "algorithmic-failure": { label: "Algorithmic Failure", color: "text-red-500 border-red-500/30" },
  "counterparty-failure": { label: "Counterparty Failure", color: "text-amber-500 border-amber-500/30" },
  "liquidity-drain": { label: "Liquidity Drain", color: "text-orange-500 border-orange-500/30" },
  "regulatory": { label: "Regulatory", color: "text-blue-500 border-blue-500/30" },
  "abandoned": { label: "Abandoned", color: "text-zinc-500 border-zinc-500/30" },
};

export const DEAD_STABLECOINS: DeadStablecoin[] = [
  {
    name: "Neutrino USD",
    symbol: "USDN",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2022-04",
    obituary:
      "Succumbed to an algorithmic death spiral after WAVES price manipulation destabilized collateral backing. Rebranded to XTN, now trading at $0.02.",
    sourceUrl:
      "https://cointelegraph.com/news/neutrino-dollar-breaks-peg-falls-to-0-82-amid-waves-price-manipulation-accusations",
    sourceLabel: "CoinTelegraph",
  },
  {
    name: "Iron Bank EURO",
    symbol: "IBEUR",
    pegCurrency: "EUR",
    causeOfDeath: "liquidity-drain",
    deathDate: "2023-12",
    obituary:
      "Liquidity pools drained after Iron Bank's lending markets froze, leaving no clear path to repeg. Still trades at a fraction of face value.",
    sourceUrl:
      "https://www.coindesk.com/business/2023/12/19/crashed-stablecoin-iron-bank-euro-ibeur-lacks-clear-repeg-path",
    sourceLabel: "CoinDesk",
  },
  {
    name: "Euro Tether",
    symbol: "EURT",
    pegCurrency: "EUR",
    causeOfDeath: "regulatory",
    deathDate: "2024-11",
    obituary:
      "Peacefully retired by Tether as MiCA regulations made EU stablecoin issuance untenable. Holders given one year to redeem.",
    sourceUrl:
      "https://cointelegraph.com/news/tether-discontinues-euro-eurt-stablecoin",
    sourceLabel: "CoinTelegraph",
  },
  {
    name: "USD+",
    symbol: "USD+",
    pegCurrency: "USD",
    causeOfDeath: "abandoned",
    deathDate: "2025-01",
    obituary:
      "Overnight Finance quietly wound down operations, leaving USD+ without active management or yield strategies.",
    sourceUrl: "https://overnight.fi/",
    sourceLabel: "Overnight.fi",
  },
  {
    name: "Elixir deUSD",
    symbol: "DEUSD",
    pegCurrency: "USD",
    causeOfDeath: "counterparty-failure",
    deathDate: "2025-11",
    obituary:
      "Lost 97% of value overnight when counterparty Stream Finance disclosed a $93M loss, wiping out 65% of deUSD's collateral.",
    sourceUrl:
      "https://beincrypto.com/elixir-deusd-stablecoin-collapse-stream-finance-loss/",
    sourceLabel: "BeInCrypto",
  },
];

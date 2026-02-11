import type { CauseOfDeath, DeadStablecoin } from "./types";

export const CAUSE_META: Record<CauseOfDeath, { label: string; color: string }> = {
  "algorithmic-failure": { label: "Algorithmic Failure", color: "text-red-500 border-red-500/30" },
  "counterparty-failure": { label: "Counterparty Failure", color: "text-amber-500 border-amber-500/30" },
  "liquidity-drain": { label: "Liquidity Drain", color: "text-orange-500 border-orange-500/30" },
  "regulatory": { label: "Regulatory", color: "text-blue-500 border-blue-500/30" },
  "abandoned": { label: "Abandoned", color: "text-zinc-500 border-zinc-500/30" },
};

/**
 * Dead stablecoins, sorted chronologically (oldest death first).
 * peakMcap values from DefiLlama historical data where available.
 */
export const DEAD_STABLECOINS: DeadStablecoin[] = [
  // ── Historical ──────────────────────────────────────────────────────
  {
    name: "NuBits",
    symbol: "USNBT",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2018-03",
    obituary:
      "One of the first stablecoins ever created (2014), NuBits held its peg for two years before collapsing when holders dumped it to chase Bitcoin gains. A pioneering cautionary tale about algorithmic pegs backed by volatile assets.",
    sourceUrl: "https://medium.com/reserve-currency/the-end-of-a-stablecoin-the-case-of-nubits-dd1f0fb427a9",
    sourceLabel: "Reserve Research",
  },
  {
    name: "Basis Cash",
    symbol: "BAC",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2021-01",
    obituary:
      "An anonymous fork of the Basis design, BAC lost its peg within weeks of launch. Later revealed to be co-founded by Do Kwon under a pseudonym -- who apparently learned nothing before building the even more catastrophic TerraUSD.",
    sourceUrl: "https://protos.com/basis-cash-the-failed-algorithmic-stablecoin-do-kwon-didnt-learn-from",
    sourceLabel: "Protos",
  },
  {
    name: "IRON",
    symbol: "IRON",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2021-06",
    obituary:
      "Dubbed crypto's \"first large-scale bank run.\" IRON was partially collateralized (75% USDC, 25% TITAN token). When whales dumped TITAN at its peak, a flawed redemption mechanism sent TITAN from $65 to zero in hours, dragging IRON down with it.",
    sourceUrl: "https://www.coindesk.com/markets/2021/06/17/in-token-crash-postmortem-iron-finance-says-it-suffered-cryptos-first-large-scale-bank-run",
    sourceLabel: "CoinDesk",
  },

  // ── Major collapses ─────────────────────────────────────────────────
  {
    name: "Neutrino USD",
    symbol: "USDN",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2022-04",
    peakMcap: 1_023_616_756,
    obituary:
      "Succumbed to an algorithmic death spiral after WAVES price manipulation destabilized collateral backing. Rebranded to XTN, now trading at $0.02.",
    sourceUrl: "https://cointelegraph.com/news/neutrino-dollar-breaks-peg-falls-to-0-82-amid-waves-price-manipulation-accusations",
    sourceLabel: "CoinTelegraph",
  },
  {
    name: "TerraUSD",
    symbol: "UST",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2022-05",
    peakMcap: 18_770_471_902,
    obituary:
      "The largest stablecoin collapse in history. UST's algorithmic peg relied on minting/burning LUNA, but a coordinated sell-off triggered a death spiral that vaporized $40B in combined value within days. Anchor's unsustainable 20% yield had concentrated 70% of supply in a single venue.",
    sourceUrl: "https://www.coindesk.com/tech/2022/05/11/usts-do-kwon-was-behind-earlier-failed-stablecoin-ex-terra-colleagues-say",
    sourceLabel: "CoinDesk",
  },
  {
    name: "DEI",
    symbol: "DEI",
    pegCurrency: "USD",
    causeOfDeath: "algorithmic-failure",
    deathDate: "2022-05",
    obituary:
      "An algorithmic stablecoin on Fantom hit by flash loan exploits totaling $16M, then finished off by contagion from UST's collapse. A further hack in May 2023 delivered the final blow.",
    sourceUrl: "https://www.coindesk.com/markets/2022/05/16/fantom-stablecoin-dei-becomes-latest-to-lose-dollar-peg",
    sourceLabel: "CoinDesk",
  },
  {
    name: "Fei USD",
    symbol: "FEI",
    pegCurrency: "USD",
    causeOfDeath: "abandoned",
    deathDate: "2022-08",
    peakMcap: 2_336_281_370,
    obituary:
      "Raised $1.3B in ETH at launch, but Tribe DAO voted to wind down citing mounting technical, financial, and regulatory risks. An $80M hack of merged Rari/Fuse lending markets sealed its fate. Holders redeemed 1:1 for DAI.",
    sourceUrl: "https://www.axios.com/2022/08/25/algorithmic-stablecoin-tribedao-fei",
    sourceLabel: "Axios",
  },
  {
    name: "HUSD",
    symbol: "HUSD",
    pegCurrency: "USD",
    causeOfDeath: "counterparty-failure",
    deathDate: "2022-10",
    peakMcap: 393_463_176,
    obituary:
      "A fiat-backed stablecoin tied to the Huobi ecosystem. When Justin Sun acquired Huobi and replaced it with USDD, HUSD was delisted with no redemption path. Crashed to $0.28.",
    sourceUrl: "https://www.coindesk.com/business/2022/10/31/after-huobi-delisting-stablecoin-husd-falls-72-from-dollar-peg",
    sourceLabel: "CoinDesk",
  },
  {
    name: "Binance USD",
    symbol: "BUSD",
    pegCurrency: "USD",
    causeOfDeath: "regulatory",
    deathDate: "2023-02",
    peakMcap: 23_462_869_722,
    obituary:
      "Once the third-largest stablecoin at $23.5B. The NYDFS ordered issuer Paxos to stop minting, while the SEC signaled intent to sue. Binance ceased support in Dec 2023, auto-converting remaining balances to FDUSD.",
    sourceUrl: "https://www.coindesk.com/business/2023/02/13/paxos-to-stop-minting-stablecoin-busd-following-regulatory-action",
    sourceLabel: "CoinDesk",
  },
  {
    name: "Iron Bank EURO",
    symbol: "IBEUR",
    pegCurrency: "EUR",
    causeOfDeath: "liquidity-drain",
    deathDate: "2023-12",
    peakMcap: 50_369_497,
    obituary:
      "Liquidity pools drained after Iron Bank's lending markets froze, leaving no clear path to repeg. Still trades at a fraction of face value.",
    sourceUrl: "https://www.coindesk.com/business/2023/12/19/crashed-stablecoin-iron-bank-euro-ibeur-lacks-clear-repeg-path",
    sourceLabel: "CoinDesk",
  },
  {
    name: "Euro Tether",
    symbol: "EURT",
    pegCurrency: "EUR",
    causeOfDeath: "regulatory",
    deathDate: "2024-11",
    peakMcap: 324_057_865,
    obituary:
      "Peacefully retired by Tether as MiCA regulations made EU stablecoin issuance untenable. Holders given one year to redeem.",
    sourceUrl: "https://cointelegraph.com/news/tether-discontinues-euro-eurt-stablecoin",
    sourceLabel: "CoinTelegraph",
  },
  {
    name: "USD+",
    symbol: "USD+",
    pegCurrency: "USD",
    causeOfDeath: "abandoned",
    deathDate: "2025-01",
    peakMcap: 73_665_779,
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
    peakMcap: 301_727_222,
    obituary:
      "Lost 97% of value overnight when counterparty Stream Finance disclosed a $93M loss, wiping out 65% of deUSD's collateral.",
    sourceUrl: "https://beincrypto.com/elixir-deusd-stablecoin-collapse-stream-finance-loss/",
    sourceLabel: "BeInCrypto",
  },
];

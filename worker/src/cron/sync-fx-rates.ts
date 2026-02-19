import { setCache } from "../lib/db";

/**
 * Fetches live FX rates from the European Central Bank (via frankfurter.app)
 * and stores them in D1 cache as fallback rates for thin peg groups.
 *
 * Format matches FALLBACK_RATES in peg-rates.ts: { peggedEUR: 1.08, ... }
 * where the value is "USD per 1 unit of the currency".
 *
 * RUB is not published by ECB (sanctions) so we keep a hardcoded fallback.
 * Runs every 2 hours.
 */

const CURRENCIES = ["EUR", "GBP", "CHF", "BRL"] as const;

const CURRENCY_TO_PEG: Record<string, string> = {
  EUR: "peggedEUR",
  GBP: "peggedGBP",
  CHF: "peggedCHF",
  BRL: "peggedBRL",
};

// RUB not available from ECB — use fixed approximation
const RUB_FALLBACK = 0.011;

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export async function syncFxRates(db: D1Database): Promise<void> {
  try {
    const url = `https://api.frankfurter.app/latest?from=USD&to=${CURRENCIES.join(",")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "StableHype/1.0 (stablecoin analytics)" },
    });

    if (!res.ok) {
      console.error(`[sync-fx-rates] frankfurter.app returned ${res.status}`);
      return;
    }

    const data: FrankfurterResponse = await res.json();

    // frankfurter returns units-per-USD (e.g. EUR: 0.93 means 1 USD = 0.93 EUR)
    // We need USD-per-unit (e.g. 1 EUR = $1.08 USD), so take the reciprocal
    const rates: Record<string, number> = {};
    for (const [currency, unitsPerUsd] of Object.entries(data.rates)) {
      const pegKey = CURRENCY_TO_PEG[currency];
      if (pegKey && unitsPerUsd > 0) {
        rates[pegKey] = Number((1 / unitsPerUsd).toFixed(6));
      }
    }

    // Add RUB fallback (not available from ECB)
    rates["peggedRUB"] = RUB_FALLBACK;

    // Sanity check: we should have rates for all mapped currencies
    const expected = Object.values(CURRENCY_TO_PEG);
    const missing = expected.filter((k) => !(k in rates));
    if (missing.length > 0) {
      console.warn(`[sync-fx-rates] Missing rates for: ${missing.join(", ")}`);
    }

    await setCache(db, "fx-rates", JSON.stringify(rates));
    console.log(`[sync-fx-rates] Cached FX rates: ${JSON.stringify(rates)}`);
  } catch (err) {
    console.error(`[sync-fx-rates] Failed:`, err);
  }
}

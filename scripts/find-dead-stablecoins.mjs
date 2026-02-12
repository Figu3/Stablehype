#!/usr/bin/env node
/**
 * Scans DefiLlama for dead stablecoins with peak mcap > $10M.
 * Fetches historical time-series for each candidate and computes peak.
 * Cross-references with our existing cemetery list.
 */

const PEAK_THRESHOLD = 10_000_000; // $10M
const CURRENT_THRESHOLD = 5_000_000; // candidates must have current supply < $5M
const RATE_LIMIT_MS = 350; // ~3 req/s to be polite

// Existing cemetery symbols (to flag already-tracked)
const CEMETERY_SYMBOLS = new Set([
  "USNBT", "ESD", "DSD", "BAC", "IRON", "USDN", "UST", "DEI", "FEI",
  "HUSD", "BUSD", "RSV", "TOR", "aUSD", "VST", "IBEUR", "eUSD", "peUSD",
  "PUSD", "USH", "STAR", "sEUR", "UXD", "BOB", "mkUSD", "ULTRA", "EURT",
  "DAI+", "USDV", "USD+", "DYAD", "MOD", "ZUSD", "GRAI", "HYUSD", "USDJ",
  "LVLUSD", "USDL", "csUSDL", "DEUSD",
]);

// Also skip stablecoins in our active tracked list
const TRACKED_IDS = new Set([
  "1","2","3","5","6","7","8","9","10","11","13","14","15","17","18","19",
  "20","21","22","23","24","25","30","31","35","36","42","43","44","47",
  "50","51","52","54","55","56","57","60","62","63","64","65","66","67",
  "69","70","71","75","77","78","79","80","83","84","85","86","88","89",
  "93","95","97","98","101","103","106","110","111","113","115","116",
  "118","119","120","122","123","124","125","126","129","132","136",
  "141","143","144","145","146","147","151","152","153","154","155",
  "156","157","158","159","160","162","163","165","166","167","168",
  "172","173","178","183","185","186","188","192","194","195","197",
  "202","204","205","207","209","212","213","214","215","216","218",
  "219","220","221","224","225","226","229","230","231","234","235",
  "236","237","238","239","240","241","243","244","245","246","247",
  "249","250","251","252","253","254","255","256","257","258","261",
  "262","263","266","268","269","270","271","272","275","277","282",
  "283","284","285","286","287","289","290","291","292","295","296",
  "297","298","299","300","302","303","304","305","306","307","308",
  "309","310","312","313","315","316","317","319","321","322","324",
  "325","326","327","328","329","331","332","335","336","339","340",
  "341","342","343","344",
]);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getCirculatingUSD(circulating) {
  if (!circulating) return 0;
  let total = 0;
  for (const chain of Object.values(circulating)) {
    if (chain && typeof chain === "object") {
      // Sum all peg types (peggedUSD, peggedEUR, etc.)
      for (const val of Object.values(chain)) {
        if (typeof val === "number") total += val;
      }
    }
  }
  return total;
}

async function main() {
  console.log("Fetching DefiLlama stablecoin list...");
  const listRes = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true");
  const listData = await listRes.json();
  const allCoins = listData.peggedAssets;
  console.log(`Total stablecoins in DefiLlama: ${allCoins.length}\n`);

  // Filter candidates: current supply < $5M
  const candidates = allCoins.filter(coin => {
    const currentCirc = getCirculatingUSD(coin.circulating);
    const id = String(coin.id);
    return currentCirc < CURRENT_THRESHOLD && !TRACKED_IDS.has(id);
  });

  console.log(`Candidates with current supply < $${(CURRENT_THRESHOLD/1e6).toFixed(0)}M: ${candidates.length}`);
  console.log("Fetching historical data for each candidate...\n");

  const results = [];
  let fetched = 0;

  for (const coin of candidates) {
    fetched++;
    if (fetched % 20 === 0) {
      console.log(`  Progress: ${fetched}/${candidates.length}...`);
    }

    try {
      await sleep(RATE_LIMIT_MS);
      const detailRes = await fetch(`https://stablecoins.llama.fi/stablecoin/${coin.id}`);
      if (!detailRes.ok) {
        console.warn(`  [WARN] Failed to fetch id=${coin.id} (${coin.symbol}): ${detailRes.status}`);
        continue;
      }
      const detail = await detailRes.json();

      // Find peak from time series
      // Structure: chainBalances → {chainName} → tokens → [{date, circulating: {peggedUSD, peggedEUR, ...}}]
      // We need to find the date with the highest total across all chains.
      let peakMcap = 0;
      let peakDate = "";

      // Build a map of date → total supply across all chains
      const dailyTotals = new Map();

      if (detail.chainBalances) {
        for (const chainData of Object.values(detail.chainBalances)) {
          const tokenSeries = chainData?.tokens;
          if (!Array.isArray(tokenSeries)) continue;

          for (const entry of tokenSeries) {
            if (!entry.date || !entry.circulating) continue;

            let entryTotal = 0;
            for (const val of Object.values(entry.circulating)) {
              if (typeof val === "number") entryTotal += val;
            }

            const existing = dailyTotals.get(entry.date) || 0;
            dailyTotals.set(entry.date, existing + entryTotal);
          }
        }
      }

      for (const [date, total] of dailyTotals) {
        if (total > peakMcap) {
          peakMcap = total;
          peakDate = new Date(date * 1000).toISOString().slice(0, 10);
        }
      }

      const currentCirc = getCirculatingUSD(coin.circulating);
      const inCemetery = CEMETERY_SYMBOLS.has(coin.symbol);

      if (peakMcap >= PEAK_THRESHOLD) {
        results.push({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          pegType: coin.pegType,
          currentCirc,
          peakMcap,
          peakDate,
          price: coin.price,
          inCemetery,
          declinePercent: peakMcap > 0 ? ((1 - currentCirc / peakMcap) * 100).toFixed(1) : "N/A",
        });
      }
    } catch (err) {
      console.warn(`  [ERR] id=${coin.id} (${coin.symbol}): ${err.message}`);
    }
  }

  // Sort by peak mcap descending
  results.sort((a, b) => b.peakMcap - a.peakMcap);

  // Print results
  const newResults = results.filter(r => !r.inCemetery);
  const existingResults = results.filter(r => r.inCemetery);

  console.log("\n" + "=".repeat(120));
  console.log(`DEAD STABLECOINS WITH PEAK > $10M (total: ${results.length}, new: ${newResults.length}, already in cemetery: ${existingResults.length})`);
  console.log("=".repeat(120));

  if (newResults.length > 0) {
    console.log("\n--- NEW CANDIDATES (not in cemetery) ---\n");
    console.log(
      "ID".padEnd(6) +
      "Symbol".padEnd(12) +
      "Name".padEnd(35) +
      "Peg".padEnd(12) +
      "Peak Mcap".padEnd(18) +
      "Peak Date".padEnd(14) +
      "Current".padEnd(16) +
      "Decline".padEnd(10) +
      "Price"
    );
    console.log("-".repeat(120));
    for (const r of newResults) {
      console.log(
        String(r.id).padEnd(6) +
        r.symbol.padEnd(12) +
        r.name.slice(0, 33).padEnd(35) +
        (r.pegType || "?").padEnd(12) +
        `$${(r.peakMcap / 1e6).toFixed(1)}M`.padEnd(18) +
        r.peakDate.padEnd(14) +
        `$${(r.currentCirc / 1e6).toFixed(2)}M`.padEnd(16) +
        `${r.declinePercent}%`.padEnd(10) +
        (typeof r.price === "number" ? `$${r.price.toFixed(4)}` : "N/A")
      );
    }
  }

  if (existingResults.length > 0) {
    console.log("\n--- ALREADY IN CEMETERY (confirmed) ---\n");
    console.log(
      "ID".padEnd(6) +
      "Symbol".padEnd(12) +
      "Name".padEnd(35) +
      "Peak Mcap".padEnd(18) +
      "Peak Date".padEnd(14) +
      "Current"
    );
    console.log("-".repeat(90));
    for (const r of existingResults) {
      console.log(
        String(r.id).padEnd(6) +
        r.symbol.padEnd(12) +
        r.name.slice(0, 33).padEnd(35) +
        `$${(r.peakMcap / 1e6).toFixed(1)}M`.padEnd(18) +
        r.peakDate.padEnd(14) +
        `$${(r.currentCirc / 1e6).toFixed(2)}M`
      );
    }
  }

  console.log(`\nTotal new candidates: ${newResults.length}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

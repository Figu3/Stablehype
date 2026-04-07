#!/usr/bin/env node
/**
 * Local merge gate — runs lint, type-check, and tests when the diff vs main
 * touches deploy-impacting code. Skips cleanly for docs/scripts-only changes.
 *
 * Usage:
 *   npm run test:merge-gate              # diffs vs origin/main
 *   MERGE_GATE_BASE_REF=main npm run ... # custom base ref
 *   MERGE_GATE_STAGED=1 npm run ...      # diff staged files only
 *
 * Exit codes:
 *   0 — gate passed (or no deploy-impact)
 *   1 — gate failed
 */
import { execSync, spawnSync } from "node:child_process";

const BASE_REF = process.env.MERGE_GATE_BASE_REF ?? "origin/main";
const STAGED = process.env.MERGE_GATE_STAGED === "1";

/** Path prefixes that, when touched, require the gate to run. */
const DEPLOY_IMPACT_PREFIXES = [
  "src/",
  "shared/",
  "worker/src/",
  "worker/migrations/",
  "worker/wrangler.toml",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "worker/tsconfig.json",
  "next.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
];

/** Path prefixes that flag a frontend (Pages) change specifically. */
const PAGES_IMPACT_PREFIXES = [
  "src/",
  "shared/",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
];

/** Path prefixes that flag a worker change specifically. */
const WORKER_IMPACT_PREFIXES = [
  "worker/src/",
  "worker/migrations/",
  "worker/wrangler.toml",
  "worker/tsconfig.json",
];

function getChangedFiles() {
  if (STAGED) {
    return execSync("git diff --name-only --cached", { encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  let mergeBase;
  try {
    mergeBase = execSync(`git merge-base ${BASE_REF} HEAD`, { encoding: "utf8" }).trim();
  } catch {
    console.error(
      `[merge-gate] Could not resolve merge-base with ${BASE_REF}. Set MERGE_GATE_BASE_REF.`,
    );
    process.exit(1);
  }

  return execSync(`git diff --name-only ${mergeBase}...HEAD`, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function matchesAny(file, prefixes) {
  return prefixes.some((p) => file === p || file.startsWith(p));
}

function run(cmd, args) {
  console.log(`\n[merge-gate] ▶ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    console.error(`[merge-gate] ✘ ${cmd} ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

const changed = getChangedFiles();
console.log(`[merge-gate] ${changed.length} changed file(s) vs ${STAGED ? "staged" : BASE_REF}`);

if (changed.length === 0) {
  console.log("[merge-gate] no changes — skipping");
  process.exit(0);
}

const deployImpacting = changed.filter((f) => matchesAny(f, DEPLOY_IMPACT_PREFIXES));
if (deployImpacting.length === 0) {
  console.log("[merge-gate] no deploy-impacting changes — skipping");
  process.exit(0);
}

console.log(`[merge-gate] ${deployImpacting.length} deploy-impacting file(s)`);
const pagesChanged = changed.some((f) => matchesAny(f, PAGES_IMPACT_PREFIXES));
const workerChanged = changed.some((f) => matchesAny(f, WORKER_IMPACT_PREFIXES));

// Common: lint + frontend type-check + tests (always run when deploy-impacting)
run("npm", ["run", "lint"]);
run("./node_modules/.bin/tsc", ["--noEmit"]);
run("npm", ["test", "--", "--run"]);

if (workerChanged) {
  console.log("[merge-gate] worker changed — running worker tsc");
  run("./node_modules/.bin/tsc", ["--noEmit", "-p", "worker/tsconfig.json"]);
}

if (pagesChanged) {
  console.log("[merge-gate] frontend changed — running next build");
  run("npm", ["run", "build"]);
}

console.log("\n[merge-gate] ✓ all checks passed");

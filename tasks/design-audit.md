# Pharos Stablecoin Tracker — Design, UI & UX Audit

## Executive Summary

Pharos is a well-built stablecoin tracker with clean typography, a cohesive dark theme, sensible information hierarchy, and useful features like multi-dimensional filtering, peg deviation tracking, and the blacklist/cemetery sections that differentiate it from competitors. The foundation is solid. This audit identifies concrete improvements across seven areas, prioritised by impact.

---

## 1. Data Table UX (High Impact)

The main stablecoin table is the core of the app. Several improvements would bring it up to best-in-class data table standards.

### 1a. Number alignment
**Issue:** Numeric columns (Price, Peg, Market Cap, 24h, 7d) use `text-right`, which is correct, but the header text for sortable columns has the sort icon *after* the label, pushing headers out of alignment with their data.
**Fix:** Right-align the header text and place sort icons to the left of the label (or above), so header and data columns scan as one vertical unit.

### 1b. No pagination on 115+ rows
**Issue:** All ~115 stablecoins render in a single scroll. The blacklist table has pagination (50/page) but the main table does not.
**Fix:** Add pagination (25 or 50 per page) or virtual scrolling. A "Show all" option satisfies power users who want one-page scanning.

### 1c. Missing sparklines
**Issue:** The 24h and 7d columns show only a percentage number. Users can't see *trajectory* — is it accelerating, decelerating, or spiking?
**Fix:** Add a tiny 7d sparkline column (40px wide) next to the percentage. Recharts or a simple SVG polyline would work. DefiLlama and CoinGecko both do this.

### 1d. Column visibility on mobile
**Issue:** The table has 10 columns. On mobile, horizontal scroll is the only strategy (`overflow-x-auto`). Users must swipe right to see Backing, Type, and Flags — columns that are useful for filtering context but less critical for scanning.
**Fix:** Implement priority-based column hiding. On `<md`, hide Backing/Type/Flags and show a row-expand chevron that reveals them. On `<sm`, also hide 7d. This eliminates horizontal scrolling entirely.

### 1e. Row click target
**Issue:** Only the coin name is a link. Users naturally expect the entire row to be clickable.
**Fix:** Make the full `<TableRow>` a click target (with `cursor-pointer` and `onClick` navigating to the detail page). Keep the explicit name link for accessibility.

### 1f. Keyboard sort
**Issue:** Sort headers use `onClick` on `<TableHead>` but lack `role="button"`, `tabIndex`, or keyboard event handling.
**Fix:** Add `role="columnheader" aria-sort="ascending|descending|none"` and `onKeyDown` for Enter/Space.

---

## 2. KPI Cards & Stats (High Impact)

### 2a. Missing trend context on stat cards
**Issue:** The CategoryStats cards show static numbers (total tracked, dominance breakdown) with no temporal context. The user can't tell at a glance whether the market is growing or shrinking.
**Fix:** Add a 24h or 7d delta below each headline number. The "Total Tracked" card should show something like `$215.4B ↑ 1.2% (7d)`. Use green/red semantic colouring with an arrow icon — never colour alone (WCAG 1.4.1).

### 2b. Detail page stat cards lack sparklines
**Issue:** The stablecoin detail page shows Price, Market Cap, Supply (24h), Supply Changes as four cards. These are numbers without visual context.
**Fix:** Add a 30d mini sparkline to the Price and Market Cap cards. The data is already available from `chartHistory`. This is the standard KPI card pattern (label → value → delta → sparkline).

### 2c. Inconsistent card accent colours
**Issue:** Cards use left-border accent colours: blue, yellow, sky, violet, red, emerald, amber — chosen per-card. Some choices feel arbitrary (why is "By Type" yellow but "Dominance" sky blue?).
**Fix:** Define a systematic accent mapping: primary metric = blue, governance = purple, growth = green, risk = red/amber. Apply consistently across all pages.

---

## 3. Navigation & Wayfinding (Medium Impact)

### 3a. No mobile hamburger menu
**Issue:** The three nav items (Dashboard, Freeze Tracker, Cemetery) are always displayed horizontally. On narrow screens (<400px), they can compress uncomfortably.
**Fix:** Below `sm` breakpoint, collapse nav into a hamburger/sheet menu. The header already has `sticky top-0` and backdrop blur, so a slide-out drawer fits naturally.

### 3b. Footer is too minimal
**Issue:** The footer is just "Watching the peg." — it wastes an opportunity to provide useful links and context.
**Fix:** Add: data source attribution (e.g. "Data from DefiLlama API"), a link to the GitHub repo if public, last updated timestamp, and the three nav links repeated (standard web convention for footer navigation).

### 3c. No breadcrumbs on detail pages
**Issue:** The detail page has a "Back" button but no breadcrumb trail. Users who arrive directly (e.g. from a shared link) have no spatial context.
**Fix:** Add a simple breadcrumb: `Dashboard / USDT` above the header. It's one component, minimal code.

### 3d. No "back to top" on long pages
**Issue:** The dashboard page is long (stats → chart → highlights → chains → summaries → filters → table). Scrolling back up is tedious.
**Fix:** Add a floating "back to top" button that appears after scrolling 400px+. Alternatively, make the filter/search bar sticky so users always have access to it.

---

## 4. Charts & Data Visualization (Medium Impact)

### 4a. No time range selector on charts
**Issue:** The TotalMcapChart and detail page charts show all available history with no way to zoom into 7d, 30d, 90d, 1y ranges.
**Fix:** Add a time range selector (pill buttons: 7D / 30D / 90D / 1Y / All). This is standard on every crypto dashboard (CoinGecko, DefiLlama, Dune). The data is already loaded — it's just a filter on the `chartHistory` array.

### 4b. Charts have no loading or empty states
**Issue:** When `detailData` is loading, the chart area is a skeleton block. But if the data loads empty (new coin, no history), there's no empty-state message.
**Fix:** Show "No price history available" centered in the chart area with a muted icon.

### 4c. Chain distribution donut has no percentage labels
**Issue:** The chain donut chart relies on colour + legend to communicate distribution. Users have to mentally match colours to segments.
**Fix:** Show percentage labels directly on slices (or as callout lines for small slices). Alternatively, switch to a horizontal stacked bar with inline labels — it's more scannable than a donut.

### 4d. Chart tooltips lack formatting
**Issue:** Chart tooltips show raw numbers without currency formatting or date formatting consistent with the rest of the app.
**Fix:** Reuse `formatCurrency` and `formatEventDate` in custom tooltip renderers.

---

## 5. Filtering & Search (Medium Impact)

### 5a. Filters are below the fold
**Issue:** The filter bar sits between the summaries section and the table — far down the page. A user who just wants to filter the table must scroll past stats, charts, highlights, chain overview, and summaries.
**Fix:** Either (a) make the filter bar sticky when the table comes into view, or (b) move filters directly above the table as a collapsible section with a "Filters" toggle. Option (b) is what DefiLlama does.

### 5b. No active filter count / indicator in the filter area header
**Issue:** When filters are active, there's a subtle "Clear all" link but no count badge.
**Fix:** Show `Filters (3)` when 3 filters are active. This provides immediate feedback about the current state.

### 5c. Search scope is unclear
**Issue:** The search input says "Search..." — but what fields does it search? Name and symbol only, per the code.
**Fix:** Update placeholder to "Search by name or symbol..." to set expectations.

### 5d. No URL-reflected filter state
**Issue:** Filters and search are local state. If a user shares a URL with specific filters applied, the recipient sees the unfiltered view.
**Fix:** Sync filter state to URL search params (`?peg=gold-peg&type=decentralized&q=dai`). This also enables browser back/forward through filter states.

---

## 6. Accessibility (Medium Impact)

### 6a. Colour-only information
**Issue:** Peg deviation uses only colour (green < 50bps, yellow < 200bps, red > 200bps) to indicate severity. The 24h/7d change columns also use only green/red.
**Fix:** Add directional arrows (↑/↓) or +/- prefixes alongside colour. The percentage sign alone isn't enough because "0.2%" doesn't convey direction unless you notice the green vs red colour.

### 6b. No `aria-live` regions for dynamic content
**Issue:** When data loads/updates or filters change, screen readers don't announce the change.
**Fix:** Add `aria-live="polite"` to the table container and the error banner. When the table re-renders with filtered results, announce "Showing X of Y stablecoins".

### 6c. Missing `aria-sort` on table headers
**Issue:** Sortable columns lack ARIA sort attributes. Screen readers can't communicate the current sort state.
**Fix:** Add `aria-sort="ascending"`, `aria-sort="descending"`, or `aria-sort="none"` to each `<TableHead>`.

### 6d. Chart accessibility
**Issue:** Charts (Recharts, lightweight-charts) render as SVG/canvas with no text alternatives.
**Fix:** Add `aria-label` on chart containers with a summary (e.g., "Total market cap chart showing $215B, up 3% over 30 days"). For the data itself, the table already serves as the accessible alternative.

### 6e. No skip-to-content link
**Issue:** No skip link to bypass the sticky header.
**Fix:** Add a visually hidden "Skip to main content" link as the first focusable element in the body.

---

## 7. Visual Polish & Micro-Interactions (Lower Impact)

### 7a. Loading skeletons don't match content shape
**Issue:** Table loading is 10 identical `<Skeleton className="h-12 w-full" />` bars. They don't resemble the actual table rows (with columns, logos, numbers).
**Fix:** Create a skeleton row component that mimics the real row layout: small circle (logo) + text bar (name) + short bars (numbers). This is called a "content-aware skeleton" and improves perceived loading speed.

### 7b. No transition animations on filter changes
**Issue:** When a filter is toggled, the table instantly re-renders with the filtered set. No animation.
**Fix:** Add a subtle `layout` animation or CSS transition on the table rows. Even a 150ms fade is enough to communicate "things changed" rather than "things popped".

### 7c. Hover states on cards
**Issue:** The stat cards and summary cards are not interactive (no click action) but the MarketHighlights cards contain clickable links. There's no visual distinction between interactive and static cards.
**Fix:** Add `hover:border-foreground/20 transition-colors` to cards that link somewhere. Keep non-interactive cards without hover changes.

### 7d. Theme toggle placement
**Issue:** The theme toggle (Sun/Moon) is in the far right of the header. It's fine but could be more discoverable.
**Fix:** Consider moving it to the footer or a settings area. The header real estate is premium — the toggle is used once and then forgotten.

### 7e. The "Watching the peg." tagline
**Issue:** Cute but provides zero utility.
**Fix:** Replace with or supplement with "Last updated: 2 min ago" to communicate data freshness. Users of financial dashboards care deeply about staleness.

---

## Priority Matrix

| # | Issue | Impact | Effort | Priority |
|---|-------|--------|--------|----------|
| 1b | Table pagination | High | Low | **P0** |
| 5a | Sticky/moved filters | High | Low | **P0** |
| 6a | Colour + arrows for direction | High | Low | **P0** |
| 2a | Trend deltas on KPI cards | High | Medium | **P1** |
| 1c | 7d sparklines in table | High | Medium | **P1** |
| 4a | Chart time range selector | High | Medium | **P1** |
| 1d | Mobile column priority hiding | High | Medium | **P1** |
| 5d | URL-synced filter state | Medium | Medium | **P1** |
| 1e | Full-row click target | Medium | Low | **P2** |
| 3a | Mobile hamburger nav | Medium | Low | **P2** |
| 3b | Richer footer | Low | Low | **P2** |
| 3c | Breadcrumbs on detail | Low | Low | **P2** |
| 5c | Search placeholder clarity | Low | Trivial | **P2** |
| 6b | aria-live regions | Medium | Low | **P2** |
| 6c | aria-sort on headers | Medium | Low | **P2** |
| 7a | Content-aware skeletons | Low | Medium | **P3** |
| 7e | Data freshness timestamp | Low | Low | **P3** |
| 4c | Chain donut labels | Low | Low | **P3** |
| 7b | Filter transition animation | Low | Low | **P3** |

---

## Competitive Positioning

Pharos has features that DefiLlama and CoinGecko lack:
- **Freeze/blacklist tracker** — unique differentiator, no competitor does this
- **Stablecoin cemetery** — creative feature, good storytelling
- **Multi-dimensional filtering** (peg + type + backing + features simultaneously)
- **Peg deviation in basis points** — more precise than CoinGecko's simple price display

What competitors do better:
- **DefiLlama**: Time range selectors on every chart, inline sparklines, stablecoin dominance area chart, chain-by-chain breakdown toggles
- **CoinGecko**: Row sparklines, market cap dominance pie, developer activity metrics, trust score badges
- **Token Terminal**: Revenue/earnings metrics for yield-bearing stablecoins, comparative charts

The biggest wins for Pharos come from borrowing the table sparklines and chart time ranges — these are table-stakes features that users of financial dashboards expect.

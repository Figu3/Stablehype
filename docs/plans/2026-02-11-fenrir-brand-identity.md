# Fenrir — Brand Identity Design

## Overview

Rebrand "Stablecoin Tracker" to **Fenrir** — a stylized arctic wolf identity that communicates vigilance, precision, and cold authority. The brand positions the tool as the watchdog of the stablecoin ecosystem.

## Name & Tagline

- **Name:** Fenrir
- **Tagline:** *"Watching the peg."*
- **Alternatives:** *"Nothing escapes the chain."* / *"On-chain vigilance."*

## Mascot & Logo

A **stylized arctic wolf head in profile**, facing right (forward-looking). Geometric, minimal line work — sharp ears, alert posture, defined jaw.

### Design Principles

- **The eye** is the signature element — a single bright frost-blue circle against the wolf silhouette. Recognizable even at 16x16.
- **No props** — no magnifying glass, badge, or hat. The wolf communicates everything.
- **Monoline or flat style** — scales cleanly from favicon to hero image.
- **Single-color knockout** — must work as white-on-dark and dark-on-light.

### Logo Variants

| Variant | Usage | Composition |
|---------|-------|-------------|
| **Favicon** (16x16, 32x32) | Browser tab | Wolf eye only — frost-blue circle on dark |
| **App icon** (192x192) | PWA, social | Wolf head silhouette, blue eye, on Deep Frost bg |
| **Header logo** | Site navigation | Wolf head icon + `F E N R I R` wordmark |
| **Full logo** | OG images, docs | Wolf head + wordmark + tagline |

### Wordmark

- Font: Geist Mono, all caps, letter-spacing `0.2em`
- Rendering: `F E N R I R`
- Sits to the right of the wolf icon in horizontal layout

## Color System

### Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Frost Blue** | `#60A5FA` | Signature accent. Wolf eye, links, active states, primary interactions |
| **Ice White** | `#F0F6FF` | Light mode backgrounds. Cool-tinted white |
| **Deep Frost** | `#0F172A` | Dark mode background. Near-black, cold blue undertone |
| **Silver** | `#94A3B8` | Secondary text, borders, muted elements |

### Relationship to Data Colors

Existing category accent colors remain unchanged:

- Yellow — CeFi / Centralized
- Orange — CeFi-Dependent
- Green — DeFi / Decentralized
- Blue — RWA-backed
- Purple — Crypto-backed
- Emerald — Yield-bearing

These are **data colors** (functional). Frost Blue is the **brand color** (identity). They occupy different layers and do not conflict.

### Freeze Tracker Enhancement

The freeze tracker page leans harder into the ice palette:

- Cards get a frost-blue left border (`border-l-3 border-[#60A5FA]`)
- Subtle frosted glass effect on card backgrounds
- Optional: faint crystalline pattern in page background

## Typography

### No Font Changes

Keep the current Geist font family:

- **Geist Sans** — body text, labels, descriptions
- **Geist Mono** — numbers, prices, percentages, wordmark

### Hierarchy Refinements

- Wordmark: Geist Mono, uppercase, `letter-spacing: 0.2em`
- Page titles: Geist Sans, bold, existing size hierarchy
- Data values: Geist Mono (unchanged)

## Voice & Copy

### Tone

Terse field analyst. Short, declarative, confident. No fluff, no hype.

### Copy Examples

| Context | Current | Fenrir |
|---------|---------|--------|
| Meta description | "Real-time stablecoin analytics dashboard" | "115 stablecoins. Every chain. Every freeze." |
| Blacklist page subtitle | "On-chain freeze and blacklist events for USDC, USDT, PAXG and XAUT across multiple chains" | "Who got frozen. When. Why it matters." |
| Empty state | *(none)* | "Nothing to report. The pack is watching." |
| Error state | *(none)* | "Signal lost. Retrying." |
| 404 page | *(none)* | "Trail gone cold." |

### Rules

- Wolf metaphor stays implicit — never "howling" or "pack mentality" puns
- No exclamation marks
- Prefer periods over ellipses
- Data speaks first, brand speaks second

## UI Integration

### Light Touch, High Impact

The dashboard is data-first. Identity should not compete with numbers.

| Element | Treatment |
|---------|-----------|
| **Header** | Wolf icon + spaced wordmark, frost-blue accent |
| **Footer** | Tagline — *"Watching the peg."* — small, silver |
| **Loading** | Wolf eye pulses (frost-blue opacity animation) |
| **Freeze Tracker** | Colder palette shift, frost-blue card borders |
| **OG image** | Wolf silhouette + wordmark + tagline on Deep Frost |
| **404 page** | Wolf looking away. *"Trail gone cold."* |

## Implementation Plan

### Phase 1 — Logo & Assets
- [ ] SVG wolf head logo (monoline, geometric)
- [ ] Favicon set (16x16, 32x32, apple-touch-icon)
- [ ] OG image template

### Phase 2 — Color & Theme
- [ ] Update CSS custom properties with Fenrir palette
- [ ] Adjust dark mode background to Deep Frost
- [ ] Add frost-blue as brand accent variable

### Phase 3 — UI Updates
- [ ] Replace header logo and app name
- [ ] Add wordmark component
- [ ] Update page titles and meta tags
- [ ] Freeze tracker page styling enhancements

### Phase 4 — Copy & Polish
- [ ] Update meta descriptions
- [ ] Add empty/error state copy
- [ ] Create 404 page
- [ ] Loading animation (wolf eye pulse)

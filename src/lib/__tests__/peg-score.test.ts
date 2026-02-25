import { describe, it, expect } from "vitest";
import { computePegScore } from "../peg-score";
import type { DepegEvent } from "../types";

/** Helper to create a depeg event with sensible defaults */
function makeEvent(overrides: Partial<DepegEvent> = {}): DepegEvent {
  return {
    id: 1,
    stablecoinId: "1",
    symbol: "USDT",
    pegType: "peggedUSD",
    direction: "below",
    peakDeviationBps: -200,
    startedAt: 1_700_000_000,
    endedAt: 1_700_086_400, // +1 day
    startPrice: 0.98,
    peakPrice: 0.98,
    recoveryPrice: 1.0,
    pegReference: 1.0,
    source: "live",
    ...overrides,
  };
}

const DAY = 86400;

describe("computePegScore", () => {
  // ── No data scenarios ──

  it("returns null score when no events and no tracking start", () => {
    const result = computePegScore([], null);
    expect(result.pegScore).toBeNull();
    expect(result.pegPct).toBe(100);
    expect(result.eventCount).toBe(0);
    expect(result.worstDeviationBps).toBeNull();
    expect(result.activeDepeg).toBe(false);
    expect(result.lastEventAt).toBeNull();
    expect(result.trackingSpanDays).toBe(0);
  });

  it("returns null score for insufficient data (<30 days)", () => {
    const now = 1_700_000_000 + 20 * DAY;
    const result = computePegScore([], 1_700_000_000, now);
    expect(result.pegScore).toBeNull();
    expect(result.trackingSpanDays).toBe(20);
  });

  // ── Basic scoring ──

  it("returns 100 for a coin with no events over 60 days", () => {
    const start = 1_700_000_000;
    const now = start + 60 * DAY;
    const result = computePegScore([], start, now);
    expect(result.pegScore).toBe(100);
    expect(result.pegPct).toBe(100);
    expect(result.severityScore).toBe(100);
    expect(result.eventCount).toBe(0);
  });

  it("computes correct pegPct for a single resolved event", () => {
    const start = 1_700_000_000;
    const now = start + 100 * DAY;
    const event = makeEvent({
      startedAt: start + 10 * DAY,
      endedAt: start + 12 * DAY, // 2-day depeg out of 100 days
      peakDeviationBps: -300,
    });

    const result = computePegScore([event], start, now);
    // 2 days out of 100 = 98% at-peg
    expect(result.pegPct).toBeCloseTo(98, 0);
    expect(result.eventCount).toBe(1);
    expect(result.worstDeviationBps).toBe(-300);
    expect(result.activeDepeg).toBe(false);
  });

  // ── Interval merging ──

  it("merges overlapping depeg intervals correctly", () => {
    const start = 1_700_000_000;
    const now = start + 100 * DAY;
    const events = [
      makeEvent({
        id: 1,
        startedAt: start + 10 * DAY,
        endedAt: start + 15 * DAY,
        peakDeviationBps: -200,
      }),
      makeEvent({
        id: 2,
        startedAt: start + 13 * DAY, // overlaps with first
        endedAt: start + 18 * DAY,
        peakDeviationBps: -400,
      }),
    ];

    const result = computePegScore(events, start, now);
    // Merged interval: day 10 to day 18 = 8 days, not 5+5=10
    // pegPct = (1 - 8/100) * 100 = 92%
    expect(result.pegPct).toBeCloseTo(92, 0);
    expect(result.eventCount).toBe(2);
    expect(result.worstDeviationBps).toBe(-400);
  });

  it("does not double-count adjacent non-overlapping intervals", () => {
    const start = 1_700_000_000;
    const now = start + 100 * DAY;
    const events = [
      makeEvent({
        id: 1,
        startedAt: start + 10 * DAY,
        endedAt: start + 15 * DAY,
        peakDeviationBps: -200,
      }),
      makeEvent({
        id: 2,
        startedAt: start + 20 * DAY, // no overlap
        endedAt: start + 25 * DAY,
        peakDeviationBps: -300,
      }),
    ];

    const result = computePegScore(events, start, now);
    // Total depeg: 5 + 5 = 10 days out of 100 = 90%
    expect(result.pegPct).toBeCloseTo(90, 0);
  });

  // ── Active depeg ──

  it("applies active depeg penalty for ongoing events", () => {
    const start = 1_700_000_000;
    const now = start + 60 * DAY;
    const event = makeEvent({
      startedAt: now - 5 * DAY,
      endedAt: null, // active
      peakDeviationBps: -500,
    });

    const result = computePegScore([event], start, now);
    expect(result.activeDepeg).toBe(true);
    // Active depeg penalty = min(50, max(2, 500/200)) = 2.5
    // Score should be lower than without penalty
    expect(result.pegScore).not.toBeNull();
    expect(result.pegScore!).toBeLessThan(100);
  });

  it("applies large penalty for severe active depeg", () => {
    const start = 1_700_000_000;
    const now = start + 60 * DAY;
    const event = makeEvent({
      startedAt: now - 1 * DAY,
      endedAt: null,
      peakDeviationBps: -7800, // severe
    });

    const result = computePegScore([event], start, now);
    expect(result.activeDepeg).toBe(true);
    // Penalty = min(50, max(2, 7800/200)) = min(50, 39) = 39
    // Score should be significantly reduced
    expect(result.pegScore!).toBeLessThan(65);
  });

  // ── Severity scoring ──

  it("penalizes more for recent events than old events", () => {
    const start = 1_700_000_000;
    const now = start + 365 * DAY;

    // Recent event
    const recentEvent = makeEvent({
      startedAt: now - 30 * DAY,
      endedAt: now - 28 * DAY,
      peakDeviationBps: -500,
    });
    const recentResult = computePegScore([recentEvent], start, now);

    // Old event (same severity but 1 year ago)
    const oldEvent = makeEvent({
      startedAt: now - 350 * DAY,
      endedAt: now - 348 * DAY,
      peakDeviationBps: -500,
    });
    const oldResult = computePegScore([oldEvent], start, now);

    // Recent event should have lower severity score (more penalty)
    expect(recentResult.severityScore).toBeLessThan(oldResult.severityScore);
  });

  // ── Worst deviation tracking ──

  it("tracks worst deviation across events (signed)", () => {
    const start = 1_700_000_000;
    const now = start + 100 * DAY;
    const events = [
      makeEvent({ id: 1, peakDeviationBps: -200 }),
      makeEvent({ id: 2, peakDeviationBps: 500 }),  // above peg
      makeEvent({ id: 3, peakDeviationBps: -800 }),  // worst by absolute value
    ];

    const result = computePegScore(events, start, now);
    expect(result.worstDeviationBps).toBe(-800);
  });

  it("prefers larger absolute deviation even if positive", () => {
    const start = 1_700_000_000;
    const now = start + 100 * DAY;
    const events = [
      makeEvent({ id: 1, peakDeviationBps: -200 }),
      makeEvent({ id: 2, peakDeviationBps: 1000 }),
    ];

    const result = computePegScore(events, start, now);
    expect(result.worstDeviationBps).toBe(1000);
  });

  // ── Last event tracking ──

  it("identifies most recent event start", () => {
    const events = [
      makeEvent({ id: 1, startedAt: 1_700_000_000 }),
      makeEvent({ id: 2, startedAt: 1_700_500_000 }),
      makeEvent({ id: 3, startedAt: 1_700_200_000 }),
    ];

    const result = computePegScore(events, 1_699_000_000, 1_701_000_000);
    expect(result.lastEventAt).toBe(1_700_500_000);
  });

  // ── Edge cases ──

  it("clamps event intervals to tracking window start", () => {
    const start = 1_700_100_000;
    const now = start + 100 * DAY;
    // Event started before tracking window
    const event = makeEvent({
      startedAt: 1_700_000_000, // before start
      endedAt: start + 5 * DAY,
      peakDeviationBps: -300,
    });

    const result = computePegScore([event], start, now);
    // Should clamp to start, so depeg duration = 5 days, not 5 + (100000/86400) days
    expect(result.pegPct).toBeCloseTo(95, 0);
  });

  it("uses earliest event as tracking start when trackingStartSec is null", () => {
    const events = [
      makeEvent({
        id: 1,
        startedAt: 1_700_000_000,
        endedAt: 1_700_086_400,
        peakDeviationBps: -200,
      }),
    ];
    const now = 1_700_000_000 + 60 * DAY;

    const result = computePegScore(events, null, now);
    expect(result.trackingSpanDays).toBe(60);
  });

  it("score is clamped between 0 and 100", () => {
    const start = 1_700_000_000;
    const now = start + 60 * DAY;
    // Many severe events to push score negative
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent({
        id: i,
        startedAt: start + i * 2 * DAY,
        endedAt: start + i * 2 * DAY + DAY,
        peakDeviationBps: -5000,
      })
    );

    const result = computePegScore(events, start, now);
    expect(result.pegScore).not.toBeNull();
    expect(result.pegScore!).toBeGreaterThanOrEqual(0);
    expect(result.pegScore!).toBeLessThanOrEqual(100);
  });
});

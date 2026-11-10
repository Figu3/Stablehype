import { describe, expect, it } from "vitest";
import { feedAge, feedStale } from "../helpers";

const READ_AT = 1_794_328_000;
const feed = (ageAtRead: number) => ({ lastUpdate: READ_AT - ageAtRead, ttl: 3600 });

describe("feedStale", () => {
  it("judges a feed at the read, not at the viewer's clock", () => {
    // Pushed 58 minutes before the read: fresh, however long ago the read itself was.
    expect(feedStale(feed(58 * 60), READ_AT)).toBe(false);
    expect(feedAge(feed(58 * 60), READ_AT)).toBe(58 * 60);
  });

  it("flags a feed already past its TTL when read", () => {
    expect(feedStale(feed(3601), READ_AT)).toBe(true);
  });

  it("leaves an unread feed unknown rather than stale", () => {
    expect(feedAge({ lastUpdate: null }, READ_AT)).toBeNull();
    expect(feedStale({ lastUpdate: null, ttl: 3600 }, READ_AT)).toBe(false);
    expect(feedStale({ lastUpdate: READ_AT - 9999, ttl: null }, READ_AT)).toBe(false);
  });
});

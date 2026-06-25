import { test, expect, describe, beforeEach } from "bun:test";
import {
  prefetchCountry,
  getCachedCountry,
  __resetCountryCacheForTests,
  type CountrySource,
} from "../src/detector/country.ts";

beforeEach(() => __resetCountryCacheForTests());

/** A source that records calls and resolves the supplied value. */
function fakeSource(value: string | undefined): { source: CountrySource; calls: string[] } {
  const calls: string[] = [];
  const source: CountrySource = async (username) => {
    calls.push(username);
    return value;
  };
  return { source, calls };
}

describe("prefetchCountry / getCachedCountry", () => {
  test("caches a fetched country and exposes it synchronously", async () => {
    const { source } = fakeSource("US");
    prefetchCountry("Bob", source);
    await Promise.resolve();
    expect(getCachedCountry("bob")).toBe("US");
  });

  test("getCachedCountry is case-insensitive on the username key", async () => {
    const { source } = fakeSource("JP");
    prefetchCountry("Hikaru", source);
    await Promise.resolve();
    expect(getCachedCountry("HIKARU")).toBe("JP");
  });

  test("returns undefined for an unknown username", () => {
    expect(getCachedCountry("nobody")).toBeUndefined();
  });

  test("collapses concurrent prefetches for the same user into one source call", async () => {
    const { source, calls } = fakeSource("US");
    prefetchCountry("bob", source);
    prefetchCountry("bob", source);
    prefetchCountry("BOB", source);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(1);
  });

  test("does not re-fetch a username already in the cache", async () => {
    const { source, calls } = fakeSource("US");
    prefetchCountry("bob", source);
    await Promise.resolve();
    prefetchCountry("bob", source);
    await Promise.resolve();
    expect(calls.length).toBe(1);
  });

  test("a source that resolves undefined caches undefined and is not retried", async () => {
    const { source, calls } = fakeSource(undefined);
    prefetchCountry("bob", source);
    await Promise.resolve();
    expect(getCachedCountry("bob")).toBeUndefined();
    prefetchCountry("bob", source);
    await Promise.resolve();
    expect(calls.length).toBe(1);
  });
});

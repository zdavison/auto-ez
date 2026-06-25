import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  prefetchCountry,
  getCachedCountry,
  __resetCountryCacheForTests,
  createLichessCountrySource,
  type CountrySource,
} from "../src/detector/country.ts";

/** Minimal shape of the GM_xmlhttpRequest details object we exercise in tests. */
interface GmRequestDetails {
  method: "GET";
  url: string;
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}

/** Extend globalThis so we can assign the fake without casting to `any`. */
declare global {
  // eslint-disable-next-line no-var
  var GM_xmlhttpRequest: ((details: GmRequestDetails) => void) | undefined;
}

beforeEach(() => __resetCountryCacheForTests());
afterEach(() => {
  // Ensure no GM_xmlhttpRequest global leaks between test cases.
  globalThis.GM_xmlhttpRequest = undefined;
});

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

describe("createLichessCountrySource", () => {
  test("resolves the country code on a 2xx response with a valid profile", async () => {
    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 200, responseText: JSON.stringify({ profile: { country: "US" } }) });
    };
    const source = createLichessCountrySource();
    expect(await source("magnus")).toBe("US");
  });

  test("builds the URL with the username percent-encoded", async () => {
    let capturedUrl = "";
    globalThis.GM_xmlhttpRequest = ({ url, onload }) => {
      capturedUrl = url;
      onload({ status: 200, responseText: JSON.stringify({ profile: { country: "US" } }) });
    };
    const source = createLichessCountrySource();
    await source("a b");
    expect(capturedUrl).toBe("https://lichess.org/api/user/a%20b");
  });

  test("resolves undefined on a non-2xx response (404)", async () => {
    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 404, responseText: "" });
    };
    const source = createLichessCountrySource();
    expect(await source("nobody")).toBeUndefined();
  });

  test("resolves undefined when the network errors (onerror)", async () => {
    globalThis.GM_xmlhttpRequest = ({ onerror }) => {
      onerror();
    };
    const source = createLichessCountrySource();
    expect(await source("bob")).toBeUndefined();
  });

  test("resolves undefined when the request times out (ontimeout)", async () => {
    globalThis.GM_xmlhttpRequest = ({ ontimeout }) => {
      ontimeout();
    };
    const source = createLichessCountrySource();
    expect(await source("bob")).toBeUndefined();
  });

  test("resolves undefined when the response body is malformed JSON", async () => {
    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 200, responseText: "not json" });
    };
    const source = createLichessCountrySource();
    expect(await source("bob")).toBeUndefined();
  });

  test("resolves undefined when the profile field is missing", async () => {
    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 200, responseText: JSON.stringify({ profile: {} }) });
    };
    const source = createLichessCountrySource();
    expect(await source("bob")).toBeUndefined();
  });

  test("resolves undefined when the entire profile object is absent", async () => {
    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 200, responseText: JSON.stringify({}) });
    };
    const source = createLichessCountrySource();
    expect(await source("bob")).toBeUndefined();
  });

  test("resolves undefined when GM_xmlhttpRequest is not installed as a global", async () => {
    // No global installed — afterEach already clears it; this test never sets one.
    const source = createLichessCountrySource();
    expect(await source("bob")).toBeUndefined();
  });
});

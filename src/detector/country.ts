/**
 * Opponent country lookup.
 *
 * The opponent's origin country is not present in the round-page DOM, so we fetch
 * it from the lichess public user API (`GET /api/user/{username}` → `profile.country`)
 * and cache it. Fetching is wrapped behind a {@link CountrySource} adapter so tests
 * (and a future extension build) can swap the transport. All failures resolve to
 * `undefined`; this module never throws.
 *
 * @see https://lichess.org/api#tag/Users/operation/apiUser
 */

/** Resolve a username to its lichess flag code, or `undefined` if none/unavailable. */
export type CountrySource = (username: string) => Promise<string | undefined>;

/** Minimal shape of Tampermonkey's GM_xmlhttpRequest we rely on. */
interface GmResponse {
  status: number;
  responseText: string;
}
interface GmRequestDetails {
  method: "GET";
  url: string;
  onload: (r: GmResponse) => void;
  onerror: () => void;
  ontimeout: () => void;
}
declare function GM_xmlhttpRequest(details: GmRequestDetails): void;

/** username (lowercased) -> resolved country (or undefined if the user has none). */
const cache = new Map<string, string | undefined>();
/** username (lowercased) -> in-flight fetch, so concurrent prefetches collapse. */
const inFlight = new Map<string, Promise<void>>();

/** Lichess profile shape we read from the API response. */
interface UserApiResponse {
  profile?: { country?: string };
}

/** Default source: lichess public user API via GM_xmlhttpRequest. Never throws. */
export function createLichessCountrySource(): CountrySource {
  return (username) =>
    new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== "function") return resolve(undefined);
      const url = `https://lichess.org/api/user/${encodeURIComponent(username)}`;
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          onload: (r) => {
            if (r.status < 200 || r.status >= 300) return resolve(undefined);
            try {
              const data = JSON.parse(r.responseText) as UserApiResponse;
              const country = data.profile?.country;
              resolve(typeof country === "string" && country ? country : undefined);
            } catch {
              resolve(undefined);
            }
          },
          onerror: () => resolve(undefined),
          ontimeout: () => resolve(undefined),
        });
      } catch {
        resolve(undefined);
      }
    });
}

const defaultSource = createLichessCountrySource();

/**
 * Begin fetching `username`'s country if not already cached or in flight.
 * Idempotent and fire-and-forget; results land in the cache for {@link getCachedCountry}.
 */
export function prefetchCountry(username: string, source: CountrySource = defaultSource): void {
  if (!username) return;
  const key = username.toLowerCase();
  if (cache.has(key) || inFlight.has(key)) return;
  const promise = source(username)
    .then((country) => {
      cache.set(key, country);
    })
    .catch(() => {
      cache.set(key, undefined);
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
}

/** Synchronous read of a previously-fetched country (`undefined` if unknown or none). */
export function getCachedCountry(username: string): string | undefined {
  return cache.get(username.toLowerCase());
}

/** Test-only: clear all cached and in-flight state. */
export function __resetCountryCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}

# Design: `username` and `country` conditions

**Date:** 2026-06-25
**Status:** Approved — ready for implementation plan
**Project status:** NOT-RELEASED (no backwards-compat / migration concerns)

## Summary

Add two new rule conditions to auto-ez:

1. **`username`** — a regular expression matched against the opponent's username.
2. **`country`** — a comma-separated list of flag codes matched against the
   opponent's origin country.

Both register in the existing condition registry, so the matcher, gate, and
sender need no changes. `PROPERTY_PRIORITY` already reserves the specificity
weights (`country: 100`, `username: 90`), so rule ordering is already correct
for these types.

The opponent's **username** is already captured by the detector
(`opponent.username`), so the `username` condition is pure and synchronous. The
opponent's **country** is *not* present in the round-page DOM and must be fetched
from the lichess public API; this is the only architecturally novel part of the
change.

## Background: why country needs a fetch

Investigation of the lichess (lila) source established:

- The in-game player block renders the opponent via
  `userLink(...)` → `fullName()`, which outputs only the title, username, and
  `userFlair` (`<img class="uflair" src=".../flair/img/{id}.webp">`).
  Source: `ui/round/src/view/user.ts`, `ui/lib/src/view/userLink.ts`.
- There is **no national-flag / country element** in the round player block.
  The `LightUser` type carries `flair` but no `country`/`flag`.
- The "emoji next to the name" some players show is a **flair**, an arbitrary
  emoji. Lichess's full flair set (3,626 entries across `activity`, `food-drink`,
  `nature`, `objects`, `people`, `smileys`, `symbols`, `travel-places`) contains
  **no national flags** — only e.g. `symbols.pirate-flag`, `symbols.rainbow-flag`.
  A flair therefore cannot express "US".
- The true origin country lives on the user's profile and is exposed by
  `GET https://lichess.org/api/user/{username}` as `profile.country` (a flag
  code such as `US`, plus regional/special codes like `GB-ENG`,
  `_united-nations`). Source: `modules/core/src/main/user.scala`
  (`@Key("country") flag: Option[FlagCode]`).

Because the country requires an async cross-origin request and the detector's
end-of-game path is fully synchronous, the country is **pre-fetched at game
start** and cached, so it is already available (synchronously) by the time a game
ends.

## Components and changes

### 1. Domain types — `src/types.ts`

Add an optional country to the opponent:

```ts
export interface Opponent {
  username?: string;
  title?: string;
  rating?: number;
  /**
   * Origin country as a lichess flag code, populated from the public user API.
   * @example "US"
   * @example "GB-ENG"
   */
  country?: string;
}
```

### 2. Condition registry — `src/conditions/index.ts`

Extend the `ConditionSpec` union:

```ts
export type ConditionSpec =
  | { type: "outcome"; value: Outcome }
  | { type: "method"; value: Method }
  /** Regex (case-insensitive, partial) matched against the opponent username. @example "^hikaru" */
  | { type: "username"; value: string }
  /** Comma-separated flag codes; matches any. @example "US, CA, GB-ENG" */
  | { type: "country"; value: string };
```

`PROPERTY_PRIORITY` is unchanged — it already contains `country: 100` and
`username: 90`.

Extend `evaluateCondition`:

- **`username`**

  ```ts
  case "username": {
    const name = result.opponent.username;
    if (!name) return false;
    try {
      return new RegExp(spec.value, "i").test(name);
    } catch {
      // Invalid pattern (should be caught at config-save time); never match.
      warnOnce(`invalid username regex: ${spec.value}`);
      return false;
    }
  }
  ```

  Semantics: case-insensitive, partial match (`.test`). `"^hikaru"` anchors;
  `"bot"` matches anywhere. Missing username → no match.

- **`country`**

  ```ts
  case "country": {
    const country = result.opponent.country?.toLowerCase();
    if (!country) return false;
    const wanted = spec.value
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    return wanted.includes(country);
  }
  ```

  Semantics: comma-separated list, each entry trimmed, exact match, case-insensitive.
  Missing country → no match.

`warnOnce` is a tiny module-local helper that logs a given message at most once
under `[auto-ez]` (a `Set<string>` guard) so a bad stored pattern cannot spam the
console on every game.

### 3. Country fetch — `src/detector/country.ts` (new)

A self-contained module with a swappable source adapter (mirrors the storage
adapter pattern), an in-memory cache, and idempotent prefetch.

```ts
/** Resolve a username to its lichess flag code, or undefined if none/unavailable. */
export type CountrySource = (username: string) => Promise<string | undefined>;

/** Default source: lichess public user API via GM_xmlhttpRequest. */
export function createLichessCountrySource(): CountrySource;

/** Idempotent, fire-and-forget; populates the cache for `username`. */
export function prefetchCountry(username: string, source?: CountrySource): void;

/** Synchronous read of a previously-fetched country (undefined if absent). */
export function getCachedCountry(username: string): string | undefined;
```

Details:

- **Cache** is a module-level `Map<string, string | undefined>` keyed by the
  lowercased username, plus a `Map<string, Promise<...>>` of in-flight requests so
  concurrent/repeat prefetches for the same user collapse into one network call.
  In-memory only (per page session); no persistence is needed.
- **Default source** issues `GET https://lichess.org/api/user/{encodeURIComponent(username)}`
  via `GM_xmlhttpRequest`, parses the JSON body, and returns `json.profile?.country`
  (a non-empty string) or `undefined`. Any error — non-2xx, network failure,
  malformed JSON, missing field — resolves to `undefined` and never throws.
- `GM_xmlhttpRequest` is declared locally (`declare function GM_xmlhttpRequest(...)`)
  with a `typeof` guard; outside a userscript sandbox the source resolves
  `undefined` rather than throwing, so tests and a future extension build degrade
  gracefully.

### 4. Prefetch trigger — `src/detector/` + `src/main.ts`

Lichess is a SPA, so "game start" is the opponent block appearing or changing,
not a page load. A thin watcher drives the prefetch:

- A `MutationObserver` (scoped to the round/opponent area, falling back to
  `document.body`) plus a one-shot check at startup. Whenever an **eligible**
  opponent username is present, it calls `prefetchCountry(username)`. Because
  prefetch is idempotent and cache-deduped, over-firing is harmless.
- Eligibility reuses the existing `getEligibleContext` /
  `readOpponent` logic so we never fetch for spectated games, computer games, or
  correspondence.

Wiring in `main.ts`:

- During `main()`, start the watcher so prefetch runs as games begin.
- In `handleEndData`, after `getEligibleContext` returns a context, set
  `context.opponent.country = getCachedCountry(context.opponent.username ?? "")`
  before calling `normalizeEndData`. If the fetch hasn't completed (rare; very
  fast games), `country` is `undefined` and a country rule simply doesn't match —
  the same safe fallback as `method: "unknown"`.

The matcher, gate, and sender are untouched.

### 5. Build header — `build.ts`

Add to the `==UserScript==` banner:

```
// @grant        GM_xmlhttpRequest
// @connect      lichess.org
```

### 6. Config UI — `src/ui/slots.ts`, `src/ui/panel.ts`, `src/ui/mount.ts`

The panel edits a rule through a fixed slot view. Extend it with two text-input
slots so users can author the new conditions:

- `RuleSlots` gains `username?: string` and `country?: string`.
- `readSlots` reads the first `username` / `country` condition value from
  `rule.when` (same pattern as `outcome` / `method`).
- `applySlot` already accepts any `ConditionType`; it upserts/removes a condition
  of the given type and preserves conditions of other types — no change needed
  beyond passing the new types.
- `mount.ts` `onUpdateRule` patch handling adds
  `if ("username" in patch) ...` and `if ("country" in patch) ...` branches.
- `panel.ts` renders two labelled text inputs — **Username (regex)** and
  **Country (comma-sep, e.g. US, CA)** — appended to `.aez-conditions`.
  Empty input → `undefined` (removes the condition).
- The username input validates its value as a regex on change; an invalid
  pattern shows an inline hint and is not stored.

## Data flow

```
round page loads / SPA-navigates to a game
        │
        ▼
 opponent block appears  ──(MutationObserver)──▶  prefetchCountry(username)
        │                                                │ GM_xmlhttpRequest
        │                                                ▼
        │                                   cache[username] = "US" | undefined
        ▼
   ... game is played ...
        │
        ▼
   socket "endData" frame
        │
        ▼
 handleEndData:
   context = getEligibleContext(...)
   context.opponent.country = getCachedCountry(username)   ◀── sync cache read
   result  = normalizeEndData(endData, context)
   rule    = matchRule(result, rules)        ◀── username/country evaluated here
   gate → sender (unchanged)
```

## Error handling

- Country fetch never throws; all failure modes resolve `undefined` → country
  rules don't match.
- Invalid username regex resolves to "no match" with a once-only console warning.
- Missing `GM_xmlhttpRequest` (non-userscript host) → source resolves `undefined`.
- All new code stays within the existing defensive posture: any failure logs
  under `[auto-ez]` and otherwise no-ops; the lichess page is never broken.

## Testing (TDD — failing tests first)

- **`test/conditions.test.ts`**
  - username: anchored (`^hikaru`), partial (`bot`), case-insensitive, invalid
    pattern → no match (no throw), missing username → no match.
  - country: single code, comma list, case-insensitive, code not in list → no
    match, missing country → no match, whitespace in list tolerated.
- **`test/country.test.ts`** (new)
  - adapter via a fake fetcher: success returns `profile.country`; 404 / network
    error / malformed JSON / missing field → `undefined`.
  - cache: second `getCachedCountry` hit after prefetch; concurrent prefetches
    collapse to a single source call (in-flight dedupe).
  - URL construction encodes the username.
- **`test/matcher.test.ts`**
  - specificity ordering with the new types: `country` outranks `username`
    outranks `method` outranks `outcome` on the weight tiebreak.
- **`test/slots.test.ts` / `test/panel.test.ts`**
  - new slots round-trip (`readSlots` ↔ `applySlot`) without clobbering other
    condition types; empty input removes the condition; invalid regex is not
    stored.

## Out of scope (YAGNI)

- Flair-based conditions (flairs cannot express countries; explicitly rejected).
- Persisting the country cache across page sessions.
- Matching on the user's title/patron status or other profile fields.
- Country fetch at game-end (rejected in favour of pre-fetch to keep the
  end→match→send flow synchronous).

# Username + Country Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new rule conditions — `username` (regex) and `country` (comma-separated flag codes) — to the auto-ez matcher, with the opponent's country pre-fetched from the lichess API at game start.

**Architecture:** Both conditions register in the existing condition registry, so the matcher/gate/sender are untouched. `username` reads the already-captured `opponent.username` synchronously. `country` needs the opponent's profile country, which is not in the page DOM, so a small fetch module pulls it from `GET /api/user/{username}` and caches it; a DOM watcher pre-fetches at game start so the country is available synchronously when the game ends.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun run build`), Tampermonkey/Violentmonkey userscript APIs (`GM_xmlhttpRequest`), shadow-DOM config UI.

## Global Constraints

- **Project status: NOT-RELEASED** — no backwards-compat or migration paths required.
- **No `any` type** unless unavoidable; never cast to `any`.
- **JSDoc** `@default` on defaulted values; `@example` where field values aren't trivially obvious (e.g. a flag code).
- **TDD**: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Defensive posture**: all new runtime code logs under `[auto-ez]` and otherwise no-ops; never throw into the lichess page.
- **Test runner**: `bun test`. **Build**: `bun run build`.
- Conditions never match on missing data (mirrors `method: "unknown"`).

---

### Task 1: `username` and `country` condition evaluation

**Files:**
- Modify: `src/types.ts` (add `country` to `Opponent`)
- Modify: `src/conditions/index.ts` (extend `ConditionSpec`, `evaluateCondition`)
- Test: `test/conditions.test.ts`

**Interfaces:**
- Consumes: `GameResult`, `Opponent` from `src/types.ts`.
- Produces:
  - `Opponent` gains `country?: string`.
  - `ConditionSpec` gains `{ type: "username"; value: string }` and `{ type: "country"; value: string }`.
  - `evaluateCondition(spec: ConditionSpec, result: GameResult): boolean` (unchanged signature) now handles both new types.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("evaluateCondition", ...)` block in `test/conditions.test.ts`:

```ts
  // --- username (regex, case-insensitive, partial) ---
  test("username condition matches a partial, case-insensitive regex", () => {
    expect(evaluateCondition({ type: "username", value: "BO" }, baseResult)).toBe(true);
  });

  test("username condition honours anchors", () => {
    expect(evaluateCondition({ type: "username", value: "^bob$" }, baseResult)).toBe(true);
    expect(evaluateCondition({ type: "username", value: "^ob" }, baseResult)).toBe(false);
  });

  test("username condition fails when the opponent has no username", () => {
    const noName: GameResult = { ...baseResult, opponent: {} };
    expect(evaluateCondition({ type: "username", value: ".*" }, noName)).toBe(false);
  });

  test("username condition with an invalid regex never matches and never throws", () => {
    expect(evaluateCondition({ type: "username", value: "[" }, baseResult)).toBe(false);
  });

  // --- country (comma-separated flag codes, case-insensitive) ---
  const us: GameResult = { ...baseResult, opponent: { username: "bob", country: "US" } };

  test("country condition matches a single code, case-insensitively", () => {
    expect(evaluateCondition({ type: "country", value: "us" }, us)).toBe(true);
  });

  test("country condition matches any code in a comma-separated list", () => {
    expect(evaluateCondition({ type: "country", value: "CA, US, GB-ENG" }, us)).toBe(true);
  });

  test("country condition fails when the code is not in the list", () => {
    expect(evaluateCondition({ type: "country", value: "CA, JP" }, us)).toBe(false);
  });

  test("country condition fails when the opponent has no country", () => {
    expect(evaluateCondition({ type: "country", value: "US" }, baseResult)).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/conditions.test.ts`
Expected: FAIL — the new cases error/return wrong values (the `switch` has no `username`/`country` cases).

- [ ] **Step 3: Add `country` to the `Opponent` type**

In `src/types.ts`, replace the `Opponent` interface with:

```ts
export interface Opponent {
  username?: string;
  /** Player title, e.g. "GM", "BOT". */
  title?: string;
  rating?: number;
  /**
   * Origin country as a lichess flag code, populated from the public user API
   * at game start. Absent if the opponent has none or the fetch hasn't resolved.
   * @example "US"
   * @example "GB-ENG"
   */
  country?: string;
}
```

- [ ] **Step 4: Extend the condition registry**

In `src/conditions/index.ts`, replace the `ConditionSpec` union with:

```ts
/** A single matchable condition within a rule. */
export type ConditionSpec =
  | { type: "outcome"; value: Outcome }
  | { type: "method"; value: Method }
  /** JS regex, compiled case-insensitive and matched partially against the opponent username. @example "^hikaru" */
  | { type: "username"; value: string }
  /** Comma-separated lichess flag codes; matches if the opponent's country is any of them. @example "US, CA, GB-ENG" */
  | { type: "country"; value: string };
```

Add a module-local warn-once helper above `evaluateCondition`:

```ts
const warned = new Set<string>();
/** Log `message` under `[auto-ez]` at most once, so a bad stored value can't spam the console. */
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[auto-ez] ${message}`);
}
```

Replace the body of `evaluateCondition` with:

```ts
export function evaluateCondition(spec: ConditionSpec, result: GameResult): boolean {
  switch (spec.type) {
    case "outcome":
      return result.outcome === spec.value;
    case "method":
      return result.method === spec.value;
    case "username": {
      const name = result.opponent.username;
      if (!name) return false;
      try {
        return new RegExp(spec.value, "i").test(name);
      } catch {
        warnOnce(`invalid username regex: ${spec.value}`);
        return false;
      }
    }
    case "country": {
      const country = result.opponent.country?.toLowerCase();
      if (!country) return false;
      const wanted = spec.value
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      return wanted.includes(country);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/conditions.test.ts`
Expected: PASS (all cases, old and new).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/conditions/index.ts test/conditions.test.ts
git commit -m "Add username (regex) and country condition evaluation"
```

---

### Task 2: Lock matcher specificity ordering for the new types

**Files:**
- Test: `test/matcher.test.ts`

**Interfaces:**
- Consumes: `sortRules`, `Rule` from `src/matcher.ts`; `PROPERTY_PRIORITY` is already `{ country: 100, username: 90, material: 80, method: 50, outcome: 40 }` — no production change.

- [ ] **Step 1: Write the failing test**

Append to `test/matcher.test.ts` (inside the top-level, after existing tests):

```ts
import { sortRules } from "../src/matcher.ts";

test("sorts country above username above method above outcome on the weight tiebreak", () => {
  const mk = (id: string, type: "country" | "username" | "method" | "outcome", value: string) => ({
    id,
    enabled: true,
    order: 0,
    when: [{ type, value } as const],
    message: id,
  });
  const rules = [
    mk("outcome", "outcome", "win"),
    mk("method", "method", "mate"),
    mk("username", "username", "bob"),
    mk("country", "country", "US"),
  ];
  expect(sortRules(rules).map((r) => r.id)).toEqual(["country", "username", "method", "outcome"]);
});
```

> Note: if `test/matcher.test.ts` already imports `sortRules`, fold the new test in and drop the duplicate import line.

- [ ] **Step 2: Run the test**

Run: `bun test test/matcher.test.ts`
Expected: PASS immediately — `PROPERTY_PRIORITY` already encodes these weights. This test locks the behaviour so a future weight change can't silently reorder rules.

- [ ] **Step 3: Commit**

```bash
git add test/matcher.test.ts
git commit -m "Lock matcher specificity ordering for username/country"
```

---

### Task 3: Country fetch module (adapter + cache + prefetch)

**Files:**
- Create: `src/detector/country.ts`
- Test: `test/country.test.ts` (new)

**Interfaces:**
- Produces:
  - `type CountrySource = (username: string) => Promise<string | undefined>`
  - `createLichessCountrySource(): CountrySource`
  - `prefetchCountry(username: string, source?: CountrySource): void` — idempotent, fire-and-forget; populates the cache.
  - `getCachedCountry(username: string): string | undefined` — synchronous cache read.
  - `__resetCountryCacheForTests(): void` — clears the cache + in-flight map (test isolation only).

- [ ] **Step 1: Write the failing tests**

Create `test/country.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/country.test.ts`
Expected: FAIL — `src/detector/country.ts` does not exist yet.

- [ ] **Step 3: Implement the module**

Create `src/detector/country.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/country.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/detector/country.ts test/country.test.ts
git commit -m "Add opponent country fetch module with caching and prefetch"
```

---

### Task 4: Pre-fetch at game start + populate country at game end + grants

**Files:**
- Modify: `src/main.ts` (prefetch watcher + populate `opponent.country` in `handleEndData`)
- Modify: `build.ts` (add `@grant GM_xmlhttpRequest`, `@connect lichess.org`)

**Interfaces:**
- Consumes: `prefetchCountry`, `getCachedCountry` from `src/detector/country.ts`; existing `getEligibleContext` from `src/detector/pageContext.ts`.
- Produces: no new exports. `main.ts` wiring only. (Consistent with the existing project: `main.ts` has no unit test; correctness here is covered by Task 1/Task 3 unit tests plus `bun run build`.)

- [ ] **Step 1: Add the grants to the build header**

In `build.ts`, the `banner` block currently lists `@grant GM_getValue / GM_setValue / GM_registerMenuCommand / unsafeWindow`. Add two lines so the block reads:

```ts
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      lichess.org
```

(Keep the surrounding `// ==UserScript==` / `// ==/UserScript==` markers and existing `@match`/version lines intact.)

- [ ] **Step 2: Wire prefetch + country population into `main.ts`**

Add the import near the other detector imports in `src/main.ts`:

```ts
import { prefetchCountry, getCachedCountry } from "./detector/country.ts";
```

Add this helper and watcher above `main()`:

```ts
/** If the current page is an eligible game, begin fetching the opponent's country. */
function prefetchOpponentCountry(): void {
  try {
    const context = getEligibleContext(document, location.pathname);
    const username = context?.opponent.username;
    if (username) prefetchCountry(username);
  } catch (err) {
    console.warn(`${LOG} country prefetch failed`, err);
  }
}

/**
 * Pre-fetch the opponent's country as games begin. Lichess is a SPA, so "game start"
 * is the opponent block appearing/changing; a MutationObserver re-checks on DOM
 * changes. Prefetch is idempotent/cache-deduped, so re-firing is harmless.
 */
function startCountryPrefetch(): void {
  prefetchOpponentCountry();
  try {
    const observer = new MutationObserver(() => prefetchOpponentCountry());
    const target = document.body ?? document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
  } catch (err) {
    console.warn(`${LOG} country watcher failed`, err);
  }
}
```

In `handleEndData`, populate the country on the context after the eligibility check and before normalizing. Replace:

```ts
    const result = normalizeEndData(endData, context);
```

with:

```ts
    context.opponent.country = getCachedCountry(context.opponent.username ?? "");
    const result = normalizeEndData(endData, context);
```

In `main()`, start the watcher after installing the WebSocket hook. Replace:

```ts
    installWebSocketHook(handleEndData, { scope: pageScope, onMessageType: noteMessageType });
    registerMenu();
```

with:

```ts
    installWebSocketHook(handleEndData, { scope: pageScope, onMessageType: noteMessageType });
    startCountryPrefetch();
    registerMenu();
```

- [ ] **Step 3: Type-check and build**

Run: `bun run build`
Expected: builds `dist/auto-ez.user.js` with no TypeScript errors, and the banner now contains `@grant GM_xmlhttpRequest` and `@connect lichess.org`.

Verify the banner (read the top of the built file):

Run: `head -n 25 dist/auto-ez.user.js`
Expected: shows both new metadata lines.

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `bun test`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts build.ts dist/auto-ez.user.js
git commit -m "Pre-fetch opponent country at game start; populate on game end"
```

> Note: `dist/auto-ez.user.js` is committed because CI enforces a build-sync check (see the most recent repo commit). If the repo does **not** track `dist/`, drop it from the `git add`.

---

### Task 5: UI slots for `username` and `country`

**Files:**
- Modify: `src/ui/slots.ts` (extend `Slots` + `ruleToSlots`)
- Test: `test/slots.test.ts`

**Interfaces:**
- Consumes: `Rule`, `ConditionType`, `applySlot` (existing — already type-generic over `ConditionType`, so no change to `applySlot`).
- Produces: `Slots` gains `username?: string` and `country?: string`; `ruleToSlots` reads both.

- [ ] **Step 1: Write the failing tests**

Append to `test/slots.test.ts`:

```ts
describe("ruleToSlots — username/country", () => {
  test("extracts username and country values", () => {
    const r = rule([
      { type: "username", value: "^bob" },
      { type: "country", value: "US, CA" },
    ]);
    expect(ruleToSlots(r)).toEqual({ username: "^bob", country: "US, CA" });
  });
});

describe("applySlot — username/country", () => {
  test("adds a username condition without clobbering an existing country", () => {
    const r = applySlot(rule([{ type: "country", value: "US" }]), "username", "^bob");
    expect(r.when).toEqual([
      { type: "country", value: "US" },
      { type: "username", value: "^bob" },
    ]);
  });

  test("removes the country condition when value is undefined", () => {
    const r = applySlot(rule([{ type: "country", value: "US" }]), "country", undefined);
    expect(r.when).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/slots.test.ts`
Expected: FAIL on the `ruleToSlots` case (returns `{}` — it doesn't read the new types). The `applySlot` cases may already pass (it's generic); that's fine.

- [ ] **Step 3: Extend `Slots` and `ruleToSlots`**

In `src/ui/slots.ts`, replace the `Slots` interface:

```ts
export interface Slots {
  outcome?: Outcome;
  method?: Method;
  /** Opponent username regex. @example "^hikaru" */
  username?: string;
  /** Comma-separated flag codes. @example "US, CA" */
  country?: string;
}
```

Replace the loop body in `ruleToSlots`:

```ts
  for (const c of rule.when) {
    if (c.type === "outcome" && slots.outcome === undefined) slots.outcome = c.value;
    else if (c.type === "method" && slots.method === undefined) slots.method = c.value;
    else if (c.type === "username" && slots.username === undefined) slots.username = c.value;
    else if (c.type === "country" && slots.country === undefined) slots.country = c.value;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/slots.ts test/slots.test.ts
git commit -m "Add username/country UI slots"
```

---

### Task 6: Panel inputs + mount wiring for `username` and `country`

**Files:**
- Modify: `src/ui/panel.ts` (`RulePatch`, two text inputs, regex validation)
- Modify: `src/ui/mount.ts` (`patchRule` handles new patch keys)
- Test: `test/panel.test.ts`

**Interfaces:**
- Consumes: `Slots`/`ruleToSlots` (Task 5), `applySlot`.
- Produces: `RulePatch` gains `username?: string | undefined` and `country?: string | undefined`; panel renders `.aez-username` and `.aez-country` text inputs; `mount.ts` `patchRule` upserts both via `applySlot`.

- [ ] **Step 1: Write the failing tests**

Append to `test/panel.test.ts` (inside its top-level `describe`/test area, using the existing `root`/`handlers`/`renderPanel` setup):

```ts
test("renders username and country inputs prefilled from the rule", () => {
  const config = makeConfig();
  config.rules[0].when.push({ type: "username", value: "^bob" });
  config.rules[0].when.push({ type: "country", value: "US, CA" });
  renderPanel(root, config, handlers);
  const card = root.querySelector('[data-rule-id="ez-on-flag"]')!;
  expect(card.querySelector<HTMLInputElement>(".aez-username")!.value).toBe("^bob");
  expect(card.querySelector<HTMLInputElement>(".aez-country")!.value).toBe("US, CA");
});

test("editing the username input emits an onUpdateRule patch", () => {
  renderPanel(root, makeConfig(), handlers);
  const card = root.querySelector('[data-rule-id="ez-on-flag"]')!;
  const input = card.querySelector<HTMLInputElement>(".aez-username")!;
  input.value = "hikaru";
  input.dispatchEvent(new Event("input"));
  expect(handlers.onUpdateRule).toHaveBeenCalledWith("ez-on-flag", { username: "hikaru" });
});

test("clearing the country input patches it to undefined", () => {
  const config = makeConfig();
  config.rules[0].when.push({ type: "country", value: "US" });
  renderPanel(root, config, handlers);
  const card = root.querySelector('[data-rule-id="ez-on-flag"]')!;
  const input = card.querySelector<HTMLInputElement>(".aez-country")!;
  input.value = "";
  input.dispatchEvent(new Event("input"));
  expect(handlers.onUpdateRule).toHaveBeenCalledWith("ez-on-flag", { country: undefined });
});

test("an invalid username regex is not stored", () => {
  renderPanel(root, makeConfig(), handlers);
  const card = root.querySelector('[data-rule-id="ez-on-flag"]')!;
  const input = card.querySelector<HTMLInputElement>(".aez-username")!;
  input.value = "[";
  input.dispatchEvent(new Event("input"));
  expect(handlers.onUpdateRule).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/panel.test.ts`
Expected: FAIL — `.aez-username` / `.aez-country` inputs don't exist yet.

- [ ] **Step 3: Extend `RulePatch` and render the inputs**

In `src/ui/panel.ts`, extend `RulePatch`:

```ts
export interface RulePatch {
  enabled?: boolean;
  outcome?: Outcome | undefined;
  method?: Method | undefined;
  username?: string | undefined;
  country?: string | undefined;
  message?: string;
}
```

In `buildRuleCard`, after the `method` select block and before the `message` input, add the two text inputs:

```ts
  const username = document.createElement("input");
  username.type = "text";
  username.className = "aez-username";
  username.placeholder = "regex…";
  username.value = slots.username ?? "";
  username.addEventListener("input", () => {
    const value = username.value || undefined;
    if (value !== undefined) {
      try {
        new RegExp(value);
      } catch {
        username.setCustomValidity("Invalid regex");
        username.reportValidity();
        return;
      }
    }
    username.setCustomValidity("");
    handlers.onUpdateRule(rule.id, { username: value });
  });

  const country = document.createElement("input");
  country.type = "text";
  country.className = "aez-country";
  country.placeholder = "US, CA…";
  country.value = slots.country ?? "";
  country.addEventListener("input", () =>
    handlers.onUpdateRule(rule.id, { country: country.value || undefined }),
  );
```

Update the `condWrap.append(...)` line to include them:

```ts
  condWrap.append(
    labeled("Outcome", outcome),
    labeled("Method", method),
    labeled("Username", username),
    labeled("Country", country),
  );
```

- [ ] **Step 4: Wire the patch keys in `mount.ts`**

In `src/ui/mount.ts`, inside `patchRule`, after the `method` branch add:

```ts
  if ("username" in patch) next = applySlot(next, "username", patch.username);
  if ("country" in patch) next = applySlot(next, "country", patch.country);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/panel.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite + build**

Run: `bun test`
Expected: PASS (everything).

Run: `bun run build`
Expected: clean build of `dist/auto-ez.user.js`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panel.ts src/ui/mount.ts test/panel.test.ts dist/auto-ez.user.js
git commit -m "Add username/country inputs to the config panel"
```

> Note: include `dist/auto-ez.user.js` only if the repo tracks the built artifact (it does as of the latest commit / CI build-sync check).

---

## Self-Review

**Spec coverage:**
- §2 types/conditions → Task 1. ✓
- §3 country fetch module (adapter, cache, in-flight dedupe, GM_xmlhttpRequest, `profile.country`) → Task 3. ✓
- §4 prefetch trigger (MutationObserver + startup) and `handleEndData` population → Task 4. ✓
- §5 build header grants → Task 4. ✓
- §6 UI slots/panel/mount + regex validation → Tasks 5–6. ✓
- §6 testing list (conditions, country, matcher, slots, panel) → Tasks 1, 3, 2, 5, 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step states the expected result. ✓

**Type consistency:** Function/type names match the actual codebase (`Slots`, `ruleToSlots`, `applySlot`, `RulePatch`, `getEligibleContext`, `normalizeEndData`) and across tasks (`CountrySource`, `prefetchCountry`, `getCachedCountry`, `__resetCountryCacheForTests`). `Opponent.country` introduced in Task 1 is consumed in Tasks 3–4. `ConditionSpec` username/country added in Task 1 are consumed by slots/panel in Tasks 5–6. ✓

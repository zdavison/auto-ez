# Lichess Auto-Message — Design

**Status:** NOT-RELEASED (local dev only)
**Date:** 2026-06-25

## Summary

A Tampermonkey/Violentmonkey **userscript** for `lichess.org` that automatically
sends a chat message when a game ends and a configured rule matches. v1 ships a
single default rule: when you **win on time** (opponent flags), it says **`ez`** in
chat.

The userscript is built from an internally **modular** source tree so it can later
graduate to a Manifest V3 browser extension with an options UI, without rewriting
the core logic.

## Goals

- Detect game results on lichess reliably and locale-independently.
- Map results to messages via an **extensible** rule engine.
- Ship the default `win + outoftime → "ez"` rule.
- Never break or interfere with the lichess page.
- Structure code so a future extension reuses `detector`/`matcher`/`sender`/`config`
  unchanged.

## Non-Goals (v1)

- No options/settings UI beyond Tampermonkey menu commands (on/off toggles).
- No matchers beyond `outcome` and `method` (country, username, material come later,
  but the design must accommodate them with zero engine changes).
- No games vs the computer, puzzles, studies, or correspondence.
- No publishing to the Chrome/Firefox stores yet.

## Scope: where it runs

- **Real-time games against human opponents only** — bullet/blitz/rapid/classical,
  casual and rated.
- Skips: vs-computer games, puzzles, studies, analysis, correspondence.

## Architecture & file layout

Single bundled userscript, internally modular. Logical modules stay as separate
concerns even though they bundle into one `.user.js`.

```
src/
  detector.ts     # WebSocket hook -> emits a normalized GameResult event
  matcher.ts      # rule engine: GameResult + conditions -> message
  conditions/     # pluggable predicate registry (outcome, method now; more later)
  sender.ts       # types message into lichess chat input, with randomized delay
  config.ts       # rules table + master on/off (persisted via storage adapter)
  storage.ts      # Storage adapter: GM_*/localStorage now, chrome.storage later
  main.ts         # wiring + userscript metadata header
dist/
  auto-bm.user.js # built artifact (Tampermonkey-installable)
```

- **Extension-ready:** all userscript-/DOM-specific access is isolated. `config`
  reads/writes only through the `Storage` adapter interface; `detector`/`matcher`/
  `sender` expose storage-agnostic, DOM-agnostic interfaces. Swapping the storage
  impl for `chrome.storage` is the only change an extension needs in this layer.
- **Build:** Bun bundles `src/main.ts` -> `dist/auto-bm.user.js`, prepending the
  userscript metadata block (`@match https://lichess.org/*`, `@grant GM_getValue`,
  `GM_setValue`, `GM_registerMenuCommand`).

## Detector & data model

The detector hooks the round page's WebSocket, reads the authoritative game-end
payload (numeric **status code** + **winner** color), and normalizes it.

```ts
type Outcome = "win" | "loss" | "draw";
type Method =
  | "mate" | "resign" | "outoftime" | "timeout"
  | "stalemate" | "draw" | "cheat" | "variantEnd" | "noStart"
  | "unknown";

interface GameResult {
  gameId: string;
  outcome: Outcome;        // computed from winner + ourColor
  method: Method;          // mapped from lichess numeric status code
  ourColor: "white" | "black";
  opponent: { username?: string; title?: string; rating?: number };
  // reserved for future matchers: fen, material delta, opponent country...
  raw: unknown;            // original payload, for debugging
}
```

Behavior:

- Hook `WebSocket` (prototype or constructor wrapper) and watch incoming messages
  for the game-end payload carrying numeric `status` + `winner`.
- Map numeric status -> `Method` via a lookup table. Lichess status enum (to be
  verified against lila during build): 30=mate, 31=resign, 32=stalemate,
  33=timeout, 34=draw, 35=outoftime, 60=variantEnd, etc. Unknown codes -> `unknown`.
- Determine `ourColor` from the page (bottom player / logged-in username match);
  compute `outcome` from `winner` vs `ourColor`.
- Enforce scope here: only emit for real-time vs-human games.
- Emit each `GameResult` **once per game** (dedupe by `gameId`).

**"Win on time" nuance:** lichess distinguishes `outoftime` (opponent's clock
flagged) from `timeout` (opponent abandoned/disconnected). The default "ez" rule
fires on **`outoftime`** (opponent flagged).

## Matcher & condition registry

One mechanism serves both v1's simple matchers and future ones.

```ts
interface Condition { type: string; test(r: GameResult): boolean; }

type ConditionSpec =
  | { type: "outcome"; value: Outcome }
  | { type: "method";  value: Method };
  // future: { type: "country"; value: string } | { type: "username"; ... }
  //         | { type: "material"; ... }

interface Rule {
  id: string;
  enabled: boolean;
  when: ConditionSpec[];   // ALL must match (AND)
  message: string;
  order: number;           // explicit final tiebreak / insertion order
  cooldownMs?: number;     // optional anti-spam per rule
}
```

### Property priority index

Each condition *type* has a weight; higher = more specific/important.

```ts
const PROPERTY_PRIORITY: Record<string, number> = {
  country:  100,
  username:  90,
  material:  80,
  method:    50,
  outcome:   40,
};
```

### Rule ordering

Rules are sorted **most-specific-first**, then the **first rule whose conditions all
match** wins and its message is sent.

Sort key, applied in order:

1. **Number of conditions, descending** — a 3-condition rule beats a 2-condition rule.
2. **Property priority (tiebreak)** — among equal counts, compare condition weights
   lexicographically, highest-priority property first. e.g. two 2-condition rules:
   `{country, outcome}` (100,40) beats `{method, outcome}` (50,40).
3. **Explicit `order`/insertion order (final tiebreak)** — deterministic.

```ts
function ruleSortKey(rule: Rule): SortKey {
  const weights = rule.when
    .map(c => PROPERTY_PRIORITY[c.type] ?? 0)
    .sort((a, b) => b - a);            // descending
  return { count: rule.when.length, weights, order: rule.order };
}
// sort: count desc -> weights lexicographic desc -> order asc
```

Rules are re-sorted on config change, not per-game.

Adding a future matcher = register a new `ConditionSpec` type + predicate + a
`PROPERTY_PRIORITY` entry. The engine does not change.

### Default shipped config

```ts
rules: [
  { id: "ez-on-flag", enabled: true, order: 0,
    when: [{ type: "outcome", value: "win" }, { type: "method", value: "outoftime" }],
    message: "ez" }
]
```

## Sender

- Locate the round chat input (`.mchat__say` textarea or equivalent — verified
  against lila at build).
- Set its value, dispatch the input/keydown events lichess listens for, and submit
  (Enter). Driving the real input routes through lichess's own validation and flood
  control.
- Apply a randomized **0.5–1.5s** delay before sending (natural pacing,
  anti-rapid-fire).
- Bail quietly (no throw) if chat is disabled/absent for the game.

## Config & storage

```ts
interface Config {
  enabled: boolean;          // master on/off
  rules: Rule[];
  globalCooldownMs: number;  // anti-spam floor across all rules
}
```

- Persisted via a `Storage` adapter (`get`/`set`). v1 impl: `GM_getValue`/
  `GM_setValue`, falling back to `localStorage`. Swappable for `chrome.storage`
  later; no other module touches storage directly.
- Master toggle + per-rule `enabled` exposed via `GM_registerMenuCommand` for a
  zero-UI on/off. A real options page arrives with the extension.
- Ships with the single default `ez-on-flag` rule.

## Error handling

The script must never break the lichess page.

- All hooks/handlers wrapped in try/catch; failures log under an `[auto-bm]` prefix
  and otherwise no-op.
- Detector emits at most once per game (dedupe by `gameId`); sender respects
  cooldowns so a reload/re-fire cannot double-send.
- Unknown status codes -> `unknown` method, which matches no default rule.

## Testing (TDD, `bun test`)

- **matcher** (pure, fully unit-tested): sort ordering (count -> priority -> order),
  first-match selection, AND-ing of conditions, the country-vs-outcome example.
- **conditions**: each predicate in isolation.
- **detector**: fed recorded sample socket payloads (mate/resign/outoftime/timeout/
  stalemate/draw, each color) -> asserts correct `GameResult`. Capture a few real
  payloads from a live game during implementation.
- **config/storage**: round-trip through a mock adapter.
- **sender**: against a jsdom-style fixture of the chat input; assert value +
  dispatched events. Live-page behavior verified manually.

## Open items to verify during implementation

- Exact lichess numeric status enum values and the game-end socket message shape
  (against the lila source / a live game).
- The chat input selector and the precise events lichess's chat UI requires.
- How `ourColor` / opponent metadata is reliably read from the round page.

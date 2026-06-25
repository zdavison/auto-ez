# auto-ez

**Status: NOT-RELEASED** (local dev only; no backwards-compat or migration concerns yet)

Lichess auto-message userscript. Detects how a real-time game vs a human ended and,
if a configured rule matches, sends a chat message (default: `ez` on a win by flag).
Built as a Tampermonkey/Violentmonkey userscript, structured so it can graduate to a
Manifest V3 browser extension.

## Commands

- `bun test` — run the test suite
- `bun run build` — bundle `src/main.ts` → `dist/auto-ez.user.js` (installable)

## Layout

- `src/detector/` — WebSocket hook + page-context reading + result normalization
- `src/conditions/` — pluggable condition predicates + property-priority index
- `src/matcher.ts` — rule engine (first enabled rule in list order that matches wins; user-reorderable)
- `src/gate.ts` — once-per-game dedupe + cooldowns
- `src/sender.ts` — types into lichess's chat input
- `src/config.ts` + `src/storage.ts` — rules table + persistence (swappable adapter)
- `src/main.ts` — wiring + Tampermonkey menu toggle

Design spec: `docs/superpowers/specs/2026-06-25-lichess-auto-message-design.md`

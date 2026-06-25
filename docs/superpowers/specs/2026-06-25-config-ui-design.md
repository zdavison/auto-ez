# auto-bm Config UI — Design

**Status:** NOT-RELEASED (local dev only)
**Date:** 2026-06-25
**Builds on:** `2026-06-25-lichess-auto-message-design.md`

## Summary

An in-page settings UI for editing auto-bm's rules, opened by a small floating
**`ez`** button on lichess pages. Full rule management (master toggle; add/delete
rules; edit message, enabled, and conditions). Rendered in a shadow DOM so styles
are isolated from lichess. Edits auto-save and take effect immediately.

## Goals

- Edit the rules table without hand-editing stored JSON.
- Master on/off; add rule; delete rule; toggle a rule; edit its message; edit its
  `outcome` and `method` conditions via dropdowns.
- No reload required — edits apply to the next game.
- Keep the core (detector/matcher/sender/gate) untouched; UI talks only to `config`.
- Style isolation from lichess (shadow DOM).

## Non-Goals (v1)

- No manual drag-to-reorder (ordering stays automatic by specificity).
- No editing of `globalCooldownMs` or per-rule `cooldownMs` (defaults stand).
- No dynamic multi-condition editor — fixed slots (one `outcome` + one `method`)
  per rule for now. Conditions are still **stored** as the general `when[]` array,
  so future condition types are not blocked.
- No theme-matching with lichess; a neutral dark theme.

## Architecture & files

UI lives in a new `src/ui/` area, separate from core logic. It reads/writes only
through the existing `config.ts` (`loadConfig`/`saveConfig`).

```
src/ui/
  slots.ts   # pure mapping: rule.when[] <-> {outcome?, method?} fixed slots  (unit-tested)
  styles.ts  # CSS string for the shadow root
  panel.ts   # renderPanel(root, config, handlers) — builds settings DOM       (unit-tested)
  mount.ts   # floating "ez" button + shadow-DOM host; wires handlers to
             # load/save/re-render  (thin integration layer)
```

`main.ts` calls `mountUI()` once after the DOM is ready (guarded against
double-mount). `handleEndData` already re-reads config per game, so edits are live.

## Components & interaction

### Floating button (`mount.ts`)

- Small round `ez` button, `position: fixed` bottom-right, high `z-index`.
- Mounted once into `document.body` inside a single host element that carries a
  **shadow root**; both button and panel render inside the shadow root for style
  isolation.
- Click toggles panel visibility. Mounting is idempotent (no duplicate buttons
  across SPA navigation).

### Panel (`panel.ts`)

`renderPanel(root: ShadowRoot | HTMLElement, config: Config, handlers): void`
rebuilds the panel DOM from the current config.

- Header: master on/off toggle + "+ Add rule" button.
- One card per rule (in config order):
  - enabled checkbox
  - Outcome `<select>`: `— / win / loss / draw`
  - Method `<select>`: `— / mate / resign / outoftime / timeout / stalemate / draw / variantEnd`
    (`—` = condition absent)
  - Message text input (`maxlength=140`)
  - Delete (✕) button

Handlers (panel stays logic-free):

```ts
interface PanelHandlers {
  onToggleMaster(enabled: boolean): void;
  onAddRule(): void;
  onDeleteRule(id: string): void;
  onUpdateRule(id: string, patch: { enabled?: boolean; outcome?: SlotValue; method?: SlotValue; message?: string }): void;
}
```

`SlotValue` is the selected dropdown value or `undefined` for `—`.

### Auto-save

Every change calls the matching handler; `mount.ts` updates the config, `saveConfig`s
it, and re-renders from the saved copy. No explicit save button.

### Empty-message safety

A new rule starts with no conditions and an empty message, `enabled: true`. The
sender path skips rules whose `message` is blank (guard in `main.ts`/`sender`), so a
half-configured rule cannot fire.

## Slots mapping (`slots.ts`)

The only real logic. Two pure functions:

- `ruleToSlots(rule: Rule): { outcome?: Outcome; method?: Method }` — reads the first
  `outcome` and first `method` condition value out of `rule.when`.
- `applySlot(rule, type: "outcome" | "method", value: string | undefined): Rule` —
  returns a new rule with that condition type set (replacing an existing one) or
  removed when `value` is `undefined` (`—`). Conditions of other types are preserved.

## Data flow

1. `mountUI()` builds the host/button, loads config, renders the panel.
2. A handler fires → `mount.ts` computes the new config (using `slots.ts` for
   condition edits), `saveConfig`s, re-renders.
3. New rule `order` = `max(existing orders) + 1`; new `id` is a short unique string.
4. `handleEndData` reads fresh config per game → edits are live.

## Error handling

- `mountUI` wrapped in try/catch: logs under `[auto-bm]`, no-ops on failure so a UI
  error never breaks lichess or the sender.
- Corrupt stored config still falls back to defaults (existing behavior).
- All rendering reads from validated config; unknown condition types in `when[]` are
  left untouched by slot edits.

## Testing (TDD, `bun test` + happy-dom)

- `slots.ts` — round-trip; removing a slot; preserving unrelated conditions.
- `panel.ts` — render a known config → assert master toggle state, one card per
  rule, dropdowns preselected, message values; simulate input/change/click →
  assert the right handler fires with the right args.
- empty-message guard — a rule with a blank message does not send.
- `mount.ts` — mounting injects exactly one button; click toggles panel; double
  mount is a no-op.

## Open items

- Exact `z-index` / position tuning against the live lichess layout (verify the
  button doesn't overlap lichess controls; adjust corner if needed).

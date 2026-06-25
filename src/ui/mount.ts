/**
 * Mount the floating "ez" button and the settings panel, and wire panel edits to
 * config persistence.
 *
 * Everything renders inside a single shadow-DOM host so lichess's CSS can't bleed
 * in and ours can't leak out. Mounting is idempotent across SPA navigation.
 */
import type { Storage } from "../storage.ts";
import type { Config } from "../config.ts";
import { loadConfig, saveConfig } from "../config.ts";
import type { Rule } from "../matcher.ts";
import { renderPanel, type PanelHandlers, type RulePatch } from "./panel.ts";
import { applySlot } from "./slots.ts";
import { PANEL_CSS } from "./styles.ts";

export const UI_ROOT_ID = "aez-root";

let ruleSeq = 0;

/** A fresh, inert rule (enabled but blank message, so it can't fire until configured). */
function newRule(config: Config): Rule {
  const maxOrder = config.rules.reduce((m, r) => Math.max(m, r.order), -1);
  ruleSeq += 1;
  return { id: `rule-${Date.now()}-${ruleSeq}`, enabled: true, order: maxOrder + 1, when: [], message: "" };
}

/** Apply a {@link RulePatch} to a rule, returning a new rule. */
function patchRule(rule: Rule, patch: RulePatch): Rule {
  let next: Rule = rule;
  if (patch.enabled !== undefined) next = { ...next, enabled: patch.enabled };
  if (patch.message !== undefined) next = { ...next, message: patch.message };
  if ("outcome" in patch) next = applySlot(next, "outcome", patch.outcome);
  if ("method" in patch) next = applySlot(next, "method", patch.method);
  if ("username" in patch) next = applySlot(next, "username", patch.username);
  if ("country" in patch) next = applySlot(next, "country", patch.country);
  return next;
}

/** Mount the UI into `parent` (default `document.body`). No-op if already mounted. */
export function mountUI(storage: Storage, parent: HTMLElement = document.body): void {
  try {
    if (document.getElementById(UI_ROOT_ID)) return;

    const hostEl = document.createElement("div");
    hostEl.id = UI_ROOT_ID;
    const shadow = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = PANEL_CSS;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "aez-ez-button";
    button.textContent = "ez";
    button.title = "auto-ez settings";

    const container = document.createElement("div");
    container.className = "aez-container";

    button.addEventListener("click", () => container.classList.toggle("aez-open"));

    shadow.append(style, button, container);

    const rerender = () => renderPanel(container, loadConfig(storage), handlers);

    const mutate = (fn: (config: Config) => Config) => {
      saveConfig(storage, fn(loadConfig(storage)));
      rerender();
    };

    const handlers: PanelHandlers = {
      onToggleMaster: (enabled) => mutate((c) => ({ ...c, enabled })),
      onAddRule: () => mutate((c) => ({ ...c, rules: [...c.rules, newRule(c)] })),
      onDeleteRule: (id) => mutate((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) })),
      onUpdateRule: (id, patch) =>
        mutate((c) => ({ ...c, rules: c.rules.map((r) => (r.id === id ? patchRule(r, patch) : r)) })),
    };

    parent.appendChild(hostEl);
    rerender();
  } catch (err) {
    console.warn("[auto-ez] failed to mount UI", err);
  }
}

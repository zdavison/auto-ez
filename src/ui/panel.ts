/**
 * Render the settings panel DOM from a {@link Config}.
 *
 * The panel is logic-free: every interaction calls a handler passed in by the
 * caller (`mount.ts`), which owns load/save/re-render. Re-rendering rebuilds the
 * panel from the current config.
 */
import type { Config } from "../config.ts";
import type { Rule } from "../matcher.ts";
import type { Outcome, Method } from "../types.ts";
import { ruleToSlots } from "./slots.ts";
import { MAX_MESSAGE_LENGTH } from "../sender.ts";

/** A patch describing a single edit to one rule. */
export interface RulePatch {
  enabled?: boolean;
  outcome?: Outcome | undefined;
  method?: Method | undefined;
  username?: string | undefined;
  country?: string | undefined;
  message?: string;
}

export interface PanelHandlers {
  onToggleMaster(enabled: boolean): void;
  onAddRule(): void;
  onDeleteRule(id: string): void;
  onUpdateRule(id: string, patch: RulePatch): void;
  /** Move a rule one step up (higher priority) or down (lower priority) in the list. */
  onMoveRule(id: string, direction: "up" | "down"): void;
}

const OUTCOME_OPTIONS: Outcome[] = ["win", "loss", "draw"];
const METHOD_OPTIONS: Method[] = [
  "mate",
  "resign",
  "outoftime",
  "timeout",
  "stalemate",
  "draw",
  "variantEnd",
];

/** Build a `<select>` with an empty "—" option plus `options`, preselecting `selected`. */
function buildSelect(className: string, options: string[], selected: string | undefined): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = className;
  for (const value of ["", ...options]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value === "" ? "—" : value;
    select.appendChild(opt);
  }
  select.value = selected ?? "";
  return select;
}

function buildRuleCard(rule: Rule, handlers: PanelHandlers, index: number, total: number): HTMLElement {
  const slots = ruleToSlots(rule);
  const card = document.createElement("div");
  card.className = "aez-rule";
  card.dataset.ruleId = rule.id;

  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "aez-enabled";
  enabled.checked = rule.enabled;
  enabled.addEventListener("change", () => handlers.onUpdateRule(rule.id, { enabled: enabled.checked }));

  const outcome = buildSelect("aez-outcome", OUTCOME_OPTIONS, slots.outcome);
  outcome.addEventListener("change", () =>
    handlers.onUpdateRule(rule.id, { outcome: (outcome.value || undefined) as Outcome | undefined }),
  );

  const method = buildSelect("aez-method", METHOD_OPTIONS, slots.method);
  method.addEventListener("change", () =>
    handlers.onUpdateRule(rule.id, { method: (method.value || undefined) as Method | undefined }),
  );

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

  const message = document.createElement("input");
  message.type = "text";
  message.className = "aez-message";
  message.maxLength = MAX_MESSAGE_LENGTH;
  message.placeholder = "message…";
  message.value = rule.message;
  message.addEventListener("input", () => handlers.onUpdateRule(rule.id, { message: message.value }));

  const up = document.createElement("button");
  up.type = "button";
  up.className = "aez-move-up";
  up.textContent = "▲";
  up.title = "Move up (higher priority)";
  up.disabled = index === 0;
  up.addEventListener("click", () => handlers.onMoveRule(rule.id, "up"));

  const down = document.createElement("button");
  down.type = "button";
  down.className = "aez-move-down";
  down.textContent = "▼";
  down.title = "Move down (lower priority)";
  down.disabled = index === total - 1;
  down.addEventListener("click", () => handlers.onMoveRule(rule.id, "down"));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "aez-delete";
  del.textContent = "✕";
  del.title = "Delete rule";
  del.addEventListener("click", () => handlers.onDeleteRule(rule.id));

  const condWrap = document.createElement("div");
  condWrap.className = "aez-conditions";
  condWrap.append(
    labeled("Outcome", outcome),
    labeled("Method", method),
    labeled("Username", username),
    labeled("Country", country),
  );

  card.append(enabled, condWrap, message, up, down, del);
  return card;
}

/** Wrap a control with a small text label. */
function labeled(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  label.className = "aez-field";
  const span = document.createElement("span");
  span.textContent = text;
  label.append(span, control);
  return label;
}

/** Render (or re-render) the panel into `root` from `config`. */
export function renderPanel(root: ShadowRoot | HTMLElement, config: Config, handlers: PanelHandlers): void {
  root.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "aez-panel";

  const header = document.createElement("div");
  header.className = "aez-header";

  const masterLabel = document.createElement("label");
  masterLabel.className = "aez-field aez-master-field";
  const master = document.createElement("input");
  master.type = "checkbox";
  master.className = "aez-master";
  master.checked = config.enabled;
  master.addEventListener("change", () => handlers.onToggleMaster(master.checked));
  const masterText = document.createElement("span");
  masterText.textContent = "Enabled";
  masterLabel.append(master, masterText);

  const add = document.createElement("button");
  add.type = "button";
  add.className = "aez-add";
  add.textContent = "+ Add rule";
  add.addEventListener("click", () => handlers.onAddRule());

  header.append(masterLabel, add);

  const list = document.createElement("div");
  list.className = "aez-rules";
  config.rules.forEach((rule, i) => list.appendChild(buildRuleCard(rule, handlers, i, config.rules.length)));

  panel.append(header, list);
  root.appendChild(panel);
}

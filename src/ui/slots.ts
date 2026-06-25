/**
 * Map between a rule's general `when[]` condition array and the UI's fixed
 * `{outcome?, method?}` slots.
 *
 * The UI edits one condition type at a time; these helpers keep conditions of other
 * types untouched, so the stored rule stays forward-compatible with condition types
 * the UI doesn't render yet.
 */
import type { Rule } from "../matcher.ts";
import type { Outcome, Method } from "../types.ts";
import type { ConditionSpec, ConditionType } from "../conditions/index.ts";

export interface Slots {
  outcome?: Outcome;
  method?: Method;
  /** Opponent username regex. @example "^hikaru" */
  username?: string;
  /** Comma-separated flag codes. @example "US, CA" */
  country?: string;
}

/** Read the first `outcome`, `method`, `username`, and `country` condition values out of a rule. */
export function ruleToSlots(rule: Rule): Slots {
  const slots: Slots = {};
  for (const c of rule.when) {
    if (c.type === "outcome" && slots.outcome === undefined) slots.outcome = c.value;
    else if (c.type === "method" && slots.method === undefined) slots.method = c.value;
    else if (c.type === "username" && slots.username === undefined) slots.username = c.value;
    else if (c.type === "country" && slots.country === undefined) slots.country = c.value;
  }
  return slots;
}

/**
 * Return a new rule with the given slot set to `value` (replacing any existing
 * condition of that type) or removed when `value` is `undefined`. Conditions of
 * other types are preserved in their original order.
 */
export function applySlot(rule: Rule, type: ConditionType, value: string | undefined): Rule {
  const others = rule.when.filter((c) => c.type !== type);
  const when = value === undefined ? others : [...others, { type, value } as ConditionSpec];
  return { ...rule, when };
}

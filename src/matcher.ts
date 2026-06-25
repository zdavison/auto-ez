/**
 * Rule engine.
 *
 * Rules are matched in list order — the array IS the priority, top to bottom.
 * The first enabled rule whose conditions all match wins. Reordering rules in
 * the config changes their priority; there is no implicit specificity ranking.
 */
import type { GameResult } from "./types.ts";
import { evaluateCondition, type ConditionSpec } from "./conditions/index.ts";

export interface Rule {
  id: string;
  /** @default true */
  enabled: boolean;
  /** Conditions that must ALL match (AND). */
  when: ConditionSpec[];
  message: string;
  /** Optional per-rule anti-spam cooldown in milliseconds. */
  cooldownMs?: number;
}

/** Whether every condition of a rule matches the result. */
function ruleMatches(rule: Rule, result: GameResult): boolean {
  return rule.when.every((spec) => evaluateCondition(spec, result));
}

/**
 * Find the rule for a result: the first enabled rule, in list order, whose
 * conditions all match, or `null` if nothing matches.
 */
export function matchRule(result: GameResult, rules: Rule[]): Rule | null {
  for (const rule of rules) {
    if (rule.enabled && ruleMatches(rule, result)) return rule;
  }
  return null;
}

/** Convenience wrapper around {@link matchRule} that returns just the message. */
export function selectMessage(result: GameResult, rules: Rule[]): string | null {
  return matchRule(result, rules)?.message ?? null;
}

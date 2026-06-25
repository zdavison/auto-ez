/**
 * Rule engine.
 *
 * Sorts rules most-specific-first, then returns the message of the first rule
 * whose conditions all match. Sorting is deterministic:
 *
 *  1. number of conditions, descending — more conditions = more specific;
 *  2. property priority (tiebreak) — compare condition weights lexicographically,
 *     highest-priority property first (see {@link PROPERTY_PRIORITY});
 *  3. explicit `order`, ascending (final tiebreak).
 */
import type { GameResult } from "./types.ts";
import { evaluateCondition, PROPERTY_PRIORITY, type ConditionSpec } from "./conditions/index.ts";

export interface Rule {
  id: string;
  /** @default true */
  enabled: boolean;
  /** Conditions that must ALL match (AND). */
  when: ConditionSpec[];
  message: string;
  /** Final tiebreak / insertion order; lower sorts first. @default 0 */
  order: number;
  /** Optional per-rule anti-spam cooldown in milliseconds. */
  cooldownMs?: number;
}

/** Descending list of a rule's condition weights, used for the priority tiebreak. */
function weightsDescending(rule: Rule): number[] {
  return rule.when.map((c) => PROPERTY_PRIORITY[c.type] ?? 0).sort((a, b) => b - a);
}

/** Lexicographic comparison of two descending weight lists. Returns >0 if `a` ranks first. */
function compareWeights(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Compare two rules; negative means `a` should sort before `b`. */
function compareRules(a: Rule, b: Rule): number {
  if (a.when.length !== b.when.length) return b.when.length - a.when.length; // count desc
  const byWeight = compareWeights(weightsDescending(b), weightsDescending(a)); // priority desc
  if (byWeight !== 0) return byWeight;
  return a.order - b.order; // order asc
}

/** Return a new array of rules sorted most-specific-first. Does not mutate the input. */
export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort(compareRules);
}

/** Whether every condition of a rule matches the result. */
function ruleMatches(rule: Rule, result: GameResult): boolean {
  return rule.when.every((spec) => evaluateCondition(spec, result));
}

/**
 * Find the rule for a result: sort enabled rules most-specific-first and return the
 * first one whose conditions all match, or `null` if nothing matches.
 */
export function matchRule(result: GameResult, rules: Rule[]): Rule | null {
  const candidates = sortRules(rules.filter((r) => r.enabled));
  for (const rule of candidates) {
    if (ruleMatches(rule, result)) return rule;
  }
  return null;
}

/** Convenience wrapper around {@link matchRule} that returns just the message. */
export function selectMessage(result: GameResult, rules: Rule[]): string | null {
  return matchRule(result, rules)?.message ?? null;
}

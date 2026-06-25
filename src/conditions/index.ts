/**
 * Condition registry.
 *
 * A condition is a named predicate over a {@link GameResult}. New condition types
 * register here by adding a variant to {@link ConditionSpec} and a case in
 * {@link evaluateCondition}; the matcher needs no changes. Rule priority is the
 * order rules appear in the config, not any per-condition weight.
 */
import type { GameResult, Outcome, Method } from "../types.ts";

/** A single matchable condition within a rule. */
export type ConditionSpec =
  | { type: "outcome"; value: Outcome }
  | { type: "method"; value: Method }
  /** JS regex, compiled case-insensitive and matched partially against the opponent username. @example "^hikaru" */
  | { type: "username"; value: string }
  /** Comma-separated lichess flag codes; matches if the opponent's country is any of them. @example "US, CA, GB-ENG" */
  | { type: "country"; value: string };

/** All condition `type` values currently supported. */
export type ConditionType = ConditionSpec["type"];

const warned = new Set<string>();
/** Log `message` under `[auto-ez]` at most once, so a bad stored value can't spam the console. */
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[auto-ez] ${message}`);
}

/** Evaluate a single condition against a game result. */
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

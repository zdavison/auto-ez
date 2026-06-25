/**
 * Condition registry.
 *
 * A condition is a named predicate over a {@link GameResult}. v1 ships `outcome`
 * and `method`; future condition types (country, username, material) register here
 * with a {@link PROPERTY_PRIORITY} weight and an entry in {@link evaluateCondition},
 * and the matcher needs no changes.
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

/**
 * Per-property specificity weight. Higher = more specific / more important, used
 * only as a tiebreak when two rules have the same number of conditions.
 *
 * Includes weights for not-yet-implemented properties so the ordering is stable
 * as those matchers land.
 */
export const PROPERTY_PRIORITY: Record<string, number> = {
  country: 100,
  username: 90,
  material: 80,
  method: 50,
  outcome: 40,
};

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

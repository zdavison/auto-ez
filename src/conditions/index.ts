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
  | { type: "method"; value: Method };

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

/** Evaluate a single condition against a game result. */
export function evaluateCondition(spec: ConditionSpec, result: GameResult): boolean {
  switch (spec.type) {
    case "outcome":
      return result.outcome === spec.value;
    case "method":
      return result.method === spec.value;
  }
}

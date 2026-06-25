/**
 * Normalize lichess's `endData` socket payload into our {@link GameResult}.
 *
 * The payload carries `status: {id, name}` and an optional `winner` color. We
 * prefer the status `name` (already the lichess `StatusName`) and fall back to the
 * numeric id, so we stay correct even if one field is ever omitted.
 *
 * @see https://github.com/lichess-org/lila/blob/master/ui/lib/src/game/status.ts
 */
import type { Color, GameResult, Method, Opponent, Outcome } from "../types.ts";

/** Lichess numeric status id -> method name. Mirrors lila's `status` map. */
const STATUS_BY_ID: Record<number, Method> = {
  30: "mate",
  31: "resign",
  32: "stalemate",
  33: "timeout",
  34: "draw",
  35: "outoftime",
  36: "cheat",
  37: "noStart",
  39: "insufficientMaterialClaim",
  60: "variantEnd",
};

const KNOWN_METHODS: ReadonlySet<string> = new Set<Method>([
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
  "cheat",
  "noStart",
  "insufficientMaterialClaim",
  "variantEnd",
]);

export interface EndDataStatus {
  id?: number;
  name?: string;
}

/** Map a lichess status object to a {@link Method}, defaulting to `unknown`. */
export function methodFromStatus(status: EndDataStatus): Method {
  if (status.name && KNOWN_METHODS.has(status.name)) return status.name as Method;
  if (status.id !== undefined && status.id in STATUS_BY_ID) return STATUS_BY_ID[status.id]!;
  return "unknown";
}

/** Derive our outcome from the winning color and our own color. */
export function outcomeFromWinner(winner: Color | undefined, ourColor: Color): Outcome {
  if (!winner) return "draw";
  return winner === ourColor ? "win" : "loss";
}

/** Minimal shape of the lichess `endData` message payload we consume. */
export interface EndData {
  winner?: Color;
  status: EndDataStatus;
}

export interface PageContext {
  gameId: string;
  ourColor: Color;
  opponent: Opponent;
}

/** Combine an `endData` payload with page-derived context into a {@link GameResult}. */
export function normalizeEndData(endData: EndData, context: PageContext): GameResult {
  return {
    gameId: context.gameId,
    outcome: outcomeFromWinner(endData.winner, context.ourColor),
    method: methodFromStatus(endData.status),
    ourColor: context.ourColor,
    opponent: context.opponent,
    raw: endData,
  };
}

/**
 * Shared domain types for auto-ez.
 *
 * These describe the normalized game result that the detector produces and the
 * matcher consumes. Keeping them DOM- and storage-agnostic is what lets the same
 * core run as a userscript today and a browser extension later.
 */

export type Color = "white" | "black";

export type Outcome = "win" | "loss" | "draw";

/**
 * Game-end method, mirroring lichess's `StatusName` for finished games.
 * `unknown` is our safe fallback for any status we don't recognize, so it never
 * matches a rule by accident.
 *
 * @see https://github.com/lichess-org/lila/blob/master/ui/lib/src/game/status.ts
 */
export type Method =
  | "mate"
  | "resign"
  | "stalemate"
  | "timeout"
  | "draw"
  | "outoftime"
  | "cheat"
  | "noStart"
  | "insufficientMaterialClaim"
  | "variantEnd"
  | "unknown";

export interface Opponent {
  username?: string;
  /** Player title, e.g. "GM", "BOT". */
  title?: string;
  rating?: number;
  /**
   * Origin country as a lichess flag code, populated from the public user API
   * at game start. Absent if the opponent has none or the fetch hasn't resolved.
   * @example "US"
   * @example "GB-ENG"
   */
  country?: string;
}

/** A finished game, normalized from lichess's `endData` socket message + page context. */
export interface GameResult {
  /** Lichess game id (8 chars), used to de-duplicate end events. */
  gameId: string;
  outcome: Outcome;
  method: Method;
  ourColor: Color;
  opponent: Opponent;
  /**
   * Original `endData` payload, kept for debugging and future matchers
   * (material, country, ...).
   */
  raw: unknown;
}

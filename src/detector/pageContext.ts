/**
 * Read game context from the round page DOM: our color, the opponent, and whether
 * this is a real-time game vs a human that we are actually playing.
 *
 * Selectors mirror lila's round view markup:
 *  - board orientation:  `.cg-wrap.orientation-{color}`
 *  - opponent block:     `.ruser-top`, human link `a.user-link[href^="/@/"]`,
 *                        title `span.utitle`, rating `<rating>`; AI has neither
 *  - live clock:         `.rclock .time` (correspondence uses `.rclock-turn`)
 *  - playing vs watching: a player's URL carries the 12-char full game id
 *
 * @see https://github.com/lichess-org/lila/blob/master/ui/round/src/view/user.ts
 * @see https://github.com/lichess-org/lila/blob/master/ui/lib/src/game/clock/clockView.ts
 */
import type { Color, Opponent } from "../types.ts";

type Root = Document | HTMLElement;

export interface GameIdInfo {
  /** Public 8-char game id. */
  gameId: string;
  /** Whether the current viewer is a participant (URL carries the 12-char full id). */
  isPlayer: boolean;
}

const FULL_ID_LENGTH = 12;
const GAME_ID_LENGTH = 8;
const ID_PATTERN = /^[a-zA-Z0-9]+$/;

/** Lichess first-path-segment routes that collide with the 8-char game-id length. */
const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  "training",
  "analysis",
  "practice",
  "settings",
  "streamer",
  "tournam", // (defensive; real route is "tournament", length 10)
]);

/** Parse the lichess game id (and whether we're a player) from a URL pathname. */
export function parseGameId(pathname: string): GameIdInfo | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment || !ID_PATTERN.test(segment) || RESERVED_SEGMENTS.has(segment)) return null;
  if (segment.length === FULL_ID_LENGTH) return { gameId: segment.slice(0, GAME_ID_LENGTH), isPlayer: true };
  if (segment.length === GAME_ID_LENGTH) return { gameId: segment, isPlayer: false };
  return null;
}

/** Our board orientation = our color in a game we play. */
export function readOrientation(root: Root): Color | null {
  if (root.querySelector(".orientation-white")) return "white";
  if (root.querySelector(".orientation-black")) return "black";
  return null;
}

export interface OpponentInfo extends Opponent {
  /** True when the opponent is the computer (no `/@/` user link). */
  isAi: boolean;
}

/** Read the opponent's identity from the top player block. */
export function readOpponent(root: Root): OpponentInfo | null {
  const top = root.querySelector(".ruser-top");
  if (!top) return null;

  const link = top.querySelector<HTMLAnchorElement>('a.user-link[href^="/@/"]');
  if (!link) return { isAi: true };

  const username = link.getAttribute("href")!.slice("/@/".length) || undefined;
  const titleEl = top.querySelector(".utitle");
  const title = titleEl?.getAttribute("data-bot") !== null && titleEl?.hasAttribute("data-bot")
    ? "BOT"
    : titleEl?.textContent?.replace(/ /g, "").trim() || undefined;
  const ratingText = top.querySelector("rating")?.textContent?.replace(/\D/g, "");
  const rating = ratingText ? Number(ratingText) : undefined;

  return { username, title, rating, isAi: false };
}

/** Whether a live (ticking) clock is present — distinguishes real-time from correspondence. */
export function isRealtime(root: Root): boolean {
  return !!root.querySelector(".rclock .time");
}

export interface EligibleContext {
  gameId: string;
  ourColor: Color;
  opponent: Opponent;
}

/**
 * Return the normalized context iff this is a real-time game vs a human that we are
 * playing; otherwise `null` (spectating, vs computer, correspondence, or unreadable).
 */
export function getEligibleContext(root: Root, pathname: string): EligibleContext | null {
  const idInfo = parseGameId(pathname);
  if (!idInfo || !idInfo.isPlayer) return null;

  const ourColor = readOrientation(root);
  if (!ourColor) return null;

  const opponent = readOpponent(root);
  if (!opponent || opponent.isAi) return null;

  if (!isRealtime(root)) return null;

  const { isAi, ...rest } = opponent;
  void isAi;
  return { gameId: idInfo.gameId, ourColor, opponent: rest };
}

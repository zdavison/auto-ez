/**
 * Send gate: decides whether a matched message may actually be sent.
 *
 * Two protections, both with time injected so they're deterministic to test:
 *  - **dedupe by game id** — at most one auto-message per game, so a page reload or
 *    a re-fired end event can't double-send;
 *  - **cooldowns** — a global floor between any two sends, plus an optional per-rule
 *    cooldown, to avoid rapid-fire chat across games.
 */
import type { Rule } from "./matcher.ts";

export class SendGate {
  private readonly claimedGames = new Set<string>();
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private readonly lastSendByRule = new Map<string, number>();

  /** @param globalCooldownMs minimum gap between any two sends, in milliseconds. */
  constructor(private readonly globalCooldownMs: number) {}

  /**
   * Attempt to claim a send for `rule` on `gameId` at time `now` (epoch ms). Returns
   * `true` and records the send if allowed; `false` (and records nothing) otherwise.
   */
  tryClaim(rule: Rule, gameId: string, now: number): boolean {
    if (this.claimedGames.has(gameId)) return false;
    if (now - this.lastSendAt < this.globalCooldownMs) return false;
    if (rule.cooldownMs !== undefined) {
      const last = this.lastSendByRule.get(rule.id) ?? Number.NEGATIVE_INFINITY;
      if (now - last < rule.cooldownMs) return false;
    }

    this.claimedGames.add(gameId);
    this.lastSendAt = now;
    this.lastSendByRule.set(rule.id, now);
    return true;
  }
}

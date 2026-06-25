/**
 * Entry point: wires the detector, matcher, gate, and sender together, and exposes
 * a master on/off toggle via Tampermonkey's menu.
 *
 * Everything here is defensive — any failure logs under `[auto-ez]` and otherwise
 * no-ops, so the script can never break the lichess page.
 */
import { installWebSocketHook } from "./detector/wsHook.ts";
import {
  getEligibleContext,
  parseGameId,
  readOrientation,
  readOpponent,
  isRealtime,
} from "./detector/pageContext.ts";
import { prefetchCountry, getCachedCountry } from "./detector/country.ts";
import { normalizeEndData, type EndData } from "./detector/result.ts";
import { matchRule } from "./matcher.ts";
import { SendGate } from "./gate.ts";
import { typeAndSend } from "./sender.ts";
import { loadConfig, saveConfig, setEnabled } from "./config.ts";
import { createDefaultStorage } from "./storage.ts";
import { mountUI } from "./ui/mount.ts";

const LOG = "[auto-ez]";
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 1500;

/**
 * Verbose diagnostics while we validate detection against the live page. Flip to
 * `false` once end-of-game detection is confirmed working.
 */
const DEBUG = true;

declare function GM_registerMenuCommand(name: string, fn: () => void): void;
/**
 * The real page `window` in a userscript sandbox. Reassigning `globalThis.WebSocket`
 * only affects the sandbox realm; lichess constructs its socket from the page realm,
 * so we must hook `unsafeWindow.WebSocket`. Falls back to `globalThis` outside
 * Tampermonkey (e.g. a future extension running in the page's main world).
 */
declare const unsafeWindow: (Window & typeof globalThis) | undefined;
const pageScope: { WebSocket: typeof WebSocket } =
  typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : globalThis;

const storage = createDefaultStorage();
const gate = new SendGate(loadConfig(storage).globalCooldownMs);
const seenMessageTypes = new Set<string>();

function debug(...args: unknown[]): void {
  if (DEBUG) console.info(LOG, ...args);
}

/** Random human-ish delay before sending. */
function sendDelayMs(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

/** Debug-only: log each distinct inbound socket message type once. */
function noteMessageType(type: string | undefined): void {
  if (!DEBUG || !type || seenMessageTypes.has(type)) return;
  seenMessageTypes.add(type);
  debug("socket message type seen:", type);
}

/** Debug-only: explain why a game is or isn't eligible, checking each signal. */
function explainEligibility(): void {
  if (!DEBUG) return;
  debug("eligibility check", {
    pathname: location.pathname,
    parsedId: parseGameId(location.pathname),
    orientation: readOrientation(document),
    opponent: readOpponent(document),
    isRealtime: isRealtime(document),
  });
}

function handleEndData(endData: EndData): void {
  try {
    debug("endData received", endData);
    const config = loadConfig(storage);
    if (!config.enabled) return debug("disabled; ignoring");

    const context = getEligibleContext(document, location.pathname);
    if (!context) {
      explainEligibility();
      return debug("not an eligible game (spectating / vs computer / correspondence)");
    }

    context.opponent.country = getCachedCountry(context.opponent.username ?? "");
    const result = normalizeEndData(endData, context);
    debug("normalized result", result);

    const rule = matchRule(result, config.rules);
    if (!rule) return debug("no rule matched");
    debug("matched rule", rule.id, "->", rule.message);

    if (rule.message.trim() === "") return debug("rule message blank; skipping");
    if (!gate.tryClaim(rule, result.gameId, Date.now())) return debug("blocked by dedupe/cooldown");

    const message = rule.message;
    setTimeout(() => {
      try {
        const sent = typeAndSend(document, message);
        if (sent) debug("sent:", message);
        else console.warn(`${LOG} chat input not found; message not sent`);
      } catch (err) {
        console.warn(`${LOG} send failed`, err);
      }
    }, sendDelayMs());
  } catch (err) {
    console.warn(`${LOG} end-of-game handling failed`, err);
  }
}

/** If the current page is an eligible game, begin fetching the opponent's country. */
function prefetchOpponentCountry(): void {
  try {
    const context = getEligibleContext(document, location.pathname);
    const username = context?.opponent.username;
    if (username) prefetchCountry(username);
  } catch (err) {
    console.warn(`${LOG} country prefetch failed`, err);
  }
}

/**
 * Pre-fetch the opponent's country as games begin. Lichess is a SPA, so "game start"
 * is the opponent block appearing/changing; a MutationObserver re-checks on DOM
 * changes. Prefetch is idempotent/cache-deduped, so re-firing is harmless.
 */
function startCountryPrefetch(): void {
  prefetchOpponentCountry();
  try {
    const observer = new MutationObserver(() => prefetchOpponentCountry());
    const target = document.body ?? document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
  } catch (err) {
    console.warn(`${LOG} country watcher failed`, err);
  }
}

function registerMenu(): void {
  if (typeof GM_registerMenuCommand !== "function") return;
  GM_registerMenuCommand("auto-ez: toggle on/off", () => {
    const next = !loadConfig(storage).enabled;
    setEnabled(storage, next);
    console.info(`${LOG} ${next ? "enabled" : "disabled"}`);
  });
}

/** Mount the settings UI once the document body exists. */
function mountWhenReady(): void {
  if (document.body) {
    mountUI(storage);
  } else {
    document.addEventListener("DOMContentLoaded", () => mountUI(storage), { once: true });
  }
}

function main(): void {
  try {
    // Ensure a config exists in storage so the menu/defaults are stable.
    saveConfig(storage, loadConfig(storage));
    installWebSocketHook(handleEndData, { scope: pageScope, onMessageType: noteMessageType });
    startCountryPrefetch();
    registerMenu();
    mountWhenReady();
    console.info(`${LOG} active${DEBUG ? " (debug)" : ""}`);
  } catch (err) {
    console.warn(`${LOG} failed to initialize`, err);
  }
}

main();

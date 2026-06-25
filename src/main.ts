/**
 * Entry point: wires the detector, matcher, gate, and sender together, and exposes
 * a master on/off toggle via Tampermonkey's menu.
 *
 * Everything here is defensive — any failure logs under `[auto-bm]` and otherwise
 * no-ops, so the script can never break the lichess page.
 */
import { installWebSocketHook } from "./detector/wsHook.ts";
import { getEligibleContext } from "./detector/pageContext.ts";
import { normalizeEndData, type EndData } from "./detector/result.ts";
import { matchRule } from "./matcher.ts";
import { SendGate } from "./gate.ts";
import { typeAndSend } from "./sender.ts";
import { loadConfig, saveConfig, setEnabled } from "./config.ts";
import { createDefaultStorage } from "./storage.ts";

const LOG = "[auto-bm]";
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 1500;

declare function GM_registerMenuCommand(name: string, fn: () => void): void;

const storage = createDefaultStorage();
const gate = new SendGate(loadConfig(storage).globalCooldownMs);

/** Random human-ish delay before sending. */
function sendDelayMs(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function handleEndData(endData: EndData): void {
  try {
    const config = loadConfig(storage);
    if (!config.enabled) return;

    const context = getEligibleContext(document, location.pathname);
    if (!context) return; // spectating, vs computer, correspondence, etc.

    const result = normalizeEndData(endData, context);
    const rule = matchRule(result, config.rules);
    if (!rule) return;

    if (!gate.tryClaim(rule, result.gameId, Date.now())) return;

    const message = rule.message;
    setTimeout(() => {
      try {
        const sent = typeAndSend(document, message);
        if (!sent) console.warn(`${LOG} chat input not found; message not sent`);
      } catch (err) {
        console.warn(`${LOG} send failed`, err);
      }
    }, sendDelayMs());
  } catch (err) {
    console.warn(`${LOG} end-of-game handling failed`, err);
  }
}

function registerMenu(): void {
  if (typeof GM_registerMenuCommand !== "function") return;
  GM_registerMenuCommand("auto-bm: toggle on/off", () => {
    const next = !loadConfig(storage).enabled;
    setEnabled(storage, next);
    console.info(`${LOG} ${next ? "enabled" : "disabled"}`);
  });
}

function main(): void {
  try {
    // Ensure a config exists in storage so the menu/defaults are stable.
    saveConfig(storage, loadConfig(storage));
    installWebSocketHook(handleEndData);
    registerMenu();
    console.info(`${LOG} active`);
  } catch (err) {
    console.warn(`${LOG} failed to initialize`, err);
  }
}

main();

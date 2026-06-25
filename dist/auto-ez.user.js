// ==UserScript==
// @name         auto-ez
// @namespace    https://github.com/auto-ez
// @version      0.1.0
// @description  Auto-send chat messages on lichess.org under configurable conditions (e.g. "ez" on a win by flag).
// @author       auto-ez
// @match        https://lichess.org/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      lichess.org
// @downloadURL  https://raw.githubusercontent.com/zdavison/auto-ez/main/dist/auto-ez.user.js
// @updateURL    https://raw.githubusercontent.com/zdavison/auto-ez/main/dist/auto-ez.user.js
// @noframes
// ==/UserScript==

// src/detector/wsHook.ts
function installWebSocketHook(onEndData, options = {}) {
  const opts = "WebSocket" in options ? { scope: options } : options;
  const scope = opts.scope ?? globalThis;
  const Original = scope.WebSocket;

  class HookedWebSocket extends Original {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener("message", (event) => {
        try {
          const data = event.data;
          if (typeof data !== "string")
            return;
          const parsed = JSON.parse(data);
          opts.onMessageType?.(parsed?.t);
          if (parsed?.t === "endData" && parsed.d)
            onEndData(parsed.d);
        } catch {}
      });
    }
  }
  scope.WebSocket = HookedWebSocket;
  return () => {
    scope.WebSocket = Original;
  };
}

// src/detector/pageContext.ts
var FULL_ID_LENGTH = 12;
var GAME_ID_LENGTH = 8;
var ID_PATTERN = /^[a-zA-Z0-9]+$/;
var RESERVED_SEGMENTS = new Set([
  "training",
  "analysis",
  "practice",
  "settings",
  "streamer",
  "tournam"
]);
function parseGameId(pathname) {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment || !ID_PATTERN.test(segment) || RESERVED_SEGMENTS.has(segment))
    return null;
  if (segment.length === FULL_ID_LENGTH)
    return { gameId: segment.slice(0, GAME_ID_LENGTH), isPlayer: true };
  if (segment.length === GAME_ID_LENGTH)
    return { gameId: segment, isPlayer: false };
  return null;
}
function readOrientation(root) {
  if (root.querySelector(".orientation-white"))
    return "white";
  if (root.querySelector(".orientation-black"))
    return "black";
  return null;
}
function readOpponent(root) {
  const top = root.querySelector(".ruser-top");
  if (!top)
    return null;
  const link = top.querySelector('a.user-link[href^="/@/"]');
  if (!link)
    return { isAi: true };
  const username = link.getAttribute("href").slice("/@/".length) || undefined;
  const titleEl = top.querySelector(".utitle");
  const title = titleEl?.getAttribute("data-bot") !== null && titleEl?.hasAttribute("data-bot") ? "BOT" : titleEl?.textContent?.replace(/ /g, "").trim() || undefined;
  const ratingText = top.querySelector("rating")?.textContent?.replace(/\D/g, "");
  const rating = ratingText ? Number(ratingText) : undefined;
  return { username, title, rating, isAi: false };
}
function isRealtime(root) {
  return !!root.querySelector(".rclock .time");
}
function getEligibleContext(root, pathname) {
  const idInfo = parseGameId(pathname);
  if (!idInfo || !idInfo.isPlayer)
    return null;
  const ourColor = readOrientation(root);
  if (!ourColor)
    return null;
  const opponent = readOpponent(root);
  if (!opponent || opponent.isAi)
    return null;
  if (!isRealtime(root))
    return null;
  const { isAi, ...rest } = opponent;
  return { gameId: idInfo.gameId, ourColor, opponent: rest };
}

// src/detector/country.ts
var cache = new Map;
var inFlight = new Map;
function createLichessCountrySource() {
  return (username) => new Promise((resolve) => {
    if (typeof GM_xmlhttpRequest !== "function")
      return resolve(undefined);
    const url = `https://lichess.org/api/user/${encodeURIComponent(username)}`;
    try {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (r) => {
          if (r.status < 200 || r.status >= 300)
            return resolve(undefined);
          try {
            const data = JSON.parse(r.responseText);
            const country = data.profile?.country;
            resolve(typeof country === "string" && country ? country : undefined);
          } catch {
            resolve(undefined);
          }
        },
        onerror: () => resolve(undefined),
        ontimeout: () => resolve(undefined)
      });
    } catch {
      resolve(undefined);
    }
  });
}
var defaultSource = createLichessCountrySource();
function prefetchCountry(username, source = defaultSource) {
  if (!username)
    return;
  const key = username.toLowerCase();
  if (cache.has(key) || inFlight.has(key))
    return;
  const promise = source(username).then((country) => {
    cache.set(key, country);
  }).catch(() => {
    cache.set(key, undefined);
  }).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
}
function getCachedCountry(username) {
  return cache.get(username.toLowerCase());
}

// src/detector/result.ts
var STATUS_BY_ID = {
  30: "mate",
  31: "resign",
  32: "stalemate",
  33: "timeout",
  34: "draw",
  35: "outoftime",
  36: "cheat",
  37: "noStart",
  39: "insufficientMaterialClaim",
  60: "variantEnd"
};
var KNOWN_METHODS = new Set([
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
  "cheat",
  "noStart",
  "insufficientMaterialClaim",
  "variantEnd"
]);
function methodFromStatus(status) {
  if (status.name && KNOWN_METHODS.has(status.name))
    return status.name;
  if (status.id !== undefined && status.id in STATUS_BY_ID)
    return STATUS_BY_ID[status.id];
  return "unknown";
}
function outcomeFromWinner(winner, ourColor) {
  if (!winner)
    return "draw";
  return winner === ourColor ? "win" : "loss";
}
function normalizeEndData(endData, context) {
  return {
    gameId: context.gameId,
    outcome: outcomeFromWinner(endData.winner, context.ourColor),
    method: methodFromStatus(endData.status),
    ourColor: context.ourColor,
    opponent: context.opponent,
    raw: endData
  };
}

// src/conditions/index.ts
var PROPERTY_PRIORITY = {
  country: 100,
  username: 90,
  material: 80,
  method: 50,
  outcome: 40
};
var warned = new Set;
function warnOnce(message) {
  if (warned.has(message))
    return;
  warned.add(message);
  console.warn(`[auto-ez] ${message}`);
}
function evaluateCondition(spec, result) {
  switch (spec.type) {
    case "outcome":
      return result.outcome === spec.value;
    case "method":
      return result.method === spec.value;
    case "username": {
      const name = result.opponent.username;
      if (!name)
        return false;
      try {
        return new RegExp(spec.value, "i").test(name);
      } catch {
        warnOnce(`invalid username regex: ${spec.value}`);
        return false;
      }
    }
    case "country": {
      const country = result.opponent.country?.toLowerCase();
      if (!country)
        return false;
      const wanted = spec.value.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
      return wanted.includes(country);
    }
  }
}

// src/matcher.ts
function weightsDescending(rule) {
  return rule.when.map((c) => PROPERTY_PRIORITY[c.type] ?? 0).sort((a, b) => b - a);
}
function compareWeights(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0;i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0)
      return diff;
  }
  return 0;
}
function compareRules(a, b) {
  if (a.when.length !== b.when.length)
    return b.when.length - a.when.length;
  const byWeight = compareWeights(weightsDescending(b), weightsDescending(a));
  if (byWeight !== 0)
    return byWeight;
  return a.order - b.order;
}
function sortRules(rules) {
  return [...rules].sort(compareRules);
}
function ruleMatches(rule, result) {
  return rule.when.every((spec) => evaluateCondition(spec, result));
}
function matchRule(result, rules) {
  const candidates = sortRules(rules.filter((r) => r.enabled));
  for (const rule of candidates) {
    if (ruleMatches(rule, result))
      return rule;
  }
  return null;
}

// src/gate.ts
class SendGate {
  globalCooldownMs;
  claimedGames = new Set;
  lastSendAt = Number.NEGATIVE_INFINITY;
  lastSendByRule = new Map;
  constructor(globalCooldownMs) {
    this.globalCooldownMs = globalCooldownMs;
  }
  tryClaim(rule, gameId, now) {
    if (this.claimedGames.has(gameId))
      return false;
    if (now - this.lastSendAt < this.globalCooldownMs)
      return false;
    if (rule.cooldownMs !== undefined) {
      const last = this.lastSendByRule.get(rule.id) ?? Number.NEGATIVE_INFINITY;
      if (now - last < rule.cooldownMs)
        return false;
    }
    this.claimedGames.add(gameId);
    this.lastSendAt = now;
    this.lastSendByRule.set(rule.id, now);
    return true;
  }
}

// src/sender.ts
var CHAT_INPUT_SELECTOR = "input.mchat__say";
var MAX_MESSAGE_LENGTH = 140;
function typeAndSend(root, message) {
  if (message.trim() === "")
    return false;
  const input = root.querySelector(CHAT_INPUT_SELECTOR);
  if (!input)
    return false;
  input.value = message.slice(0, MAX_MESSAGE_LENGTH);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  return true;
}

// src/config.ts
var STORAGE_KEY = "auto-ez:config";
var DEFAULT_CONFIG = {
  enabled: true,
  globalCooldownMs: 3000,
  rules: [
    {
      id: "ez-on-flag",
      enabled: true,
      order: 0,
      when: [
        { type: "outcome", value: "win" },
        { type: "method", value: "outoftime" }
      ],
      message: "ez"
    }
  ]
};
function loadConfig(storage) {
  const raw = storage.get(STORAGE_KEY);
  if (!raw)
    return structuredClone(DEFAULT_CONFIG);
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[auto-ez] stored config is corrupt; using defaults");
    return structuredClone(DEFAULT_CONFIG);
  }
}
function saveConfig(storage, config) {
  storage.set(STORAGE_KEY, JSON.stringify(config));
}
function setEnabled(storage, enabled) {
  const config = { ...loadConfig(storage), enabled };
  saveConfig(storage, config);
  return config;
}

// src/storage.ts
function createDefaultStorage() {
  const hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function";
  if (hasGM) {
    return {
      get: (key) => {
        const v = GM_getValue(key);
        return v === undefined ? null : v;
      },
      set: (key, value) => GM_setValue(key, value)
    };
  }
  return {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value)
  };
}

// src/ui/slots.ts
function ruleToSlots(rule) {
  const slots = {};
  for (const c of rule.when) {
    if (c.type === "outcome" && slots.outcome === undefined)
      slots.outcome = c.value;
    else if (c.type === "method" && slots.method === undefined)
      slots.method = c.value;
    else if (c.type === "username" && slots.username === undefined)
      slots.username = c.value;
    else if (c.type === "country" && slots.country === undefined)
      slots.country = c.value;
  }
  return slots;
}
function applySlot(rule, type, value) {
  const others = rule.when.filter((c) => c.type !== type);
  const when = value === undefined ? others : [...others, { type, value }];
  return { ...rule, when };
}

// src/ui/panel.ts
var OUTCOME_OPTIONS = ["win", "loss", "draw"];
var METHOD_OPTIONS = [
  "mate",
  "resign",
  "outoftime",
  "timeout",
  "stalemate",
  "draw",
  "variantEnd"
];
function buildSelect(className, options, selected) {
  const select = document.createElement("select");
  select.className = className;
  for (const value of ["", ...options]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value === "" ? "—" : value;
    select.appendChild(opt);
  }
  select.value = selected ?? "";
  return select;
}
function buildRuleCard(rule, handlers) {
  const slots = ruleToSlots(rule);
  const card = document.createElement("div");
  card.className = "aez-rule";
  card.dataset.ruleId = rule.id;
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "aez-enabled";
  enabled.checked = rule.enabled;
  enabled.addEventListener("change", () => handlers.onUpdateRule(rule.id, { enabled: enabled.checked }));
  const outcome = buildSelect("aez-outcome", OUTCOME_OPTIONS, slots.outcome);
  outcome.addEventListener("change", () => handlers.onUpdateRule(rule.id, { outcome: outcome.value || undefined }));
  const method = buildSelect("aez-method", METHOD_OPTIONS, slots.method);
  method.addEventListener("change", () => handlers.onUpdateRule(rule.id, { method: method.value || undefined }));
  const username = document.createElement("input");
  username.type = "text";
  username.className = "aez-username";
  username.placeholder = "regex…";
  username.value = slots.username ?? "";
  username.addEventListener("input", () => {
    const value = username.value || undefined;
    if (value !== undefined) {
      try {
        new RegExp(value);
      } catch {
        username.setCustomValidity("Invalid regex");
        username.reportValidity();
        return;
      }
    }
    username.setCustomValidity("");
    handlers.onUpdateRule(rule.id, { username: value });
  });
  const country = document.createElement("input");
  country.type = "text";
  country.className = "aez-country";
  country.placeholder = "US, CA…";
  country.value = slots.country ?? "";
  country.addEventListener("input", () => handlers.onUpdateRule(rule.id, { country: country.value || undefined }));
  const message = document.createElement("input");
  message.type = "text";
  message.className = "aez-message";
  message.maxLength = MAX_MESSAGE_LENGTH;
  message.placeholder = "message…";
  message.value = rule.message;
  message.addEventListener("input", () => handlers.onUpdateRule(rule.id, { message: message.value }));
  const del = document.createElement("button");
  del.type = "button";
  del.className = "aez-delete";
  del.textContent = "✕";
  del.title = "Delete rule";
  del.addEventListener("click", () => handlers.onDeleteRule(rule.id));
  const condWrap = document.createElement("div");
  condWrap.className = "aez-conditions";
  condWrap.append(labeled("Outcome", outcome), labeled("Method", method), labeled("Username", username), labeled("Country", country));
  card.append(enabled, condWrap, message, del);
  return card;
}
function labeled(text, control) {
  const label = document.createElement("label");
  label.className = "aez-field";
  const span = document.createElement("span");
  span.textContent = text;
  label.append(span, control);
  return label;
}
function renderPanel(root, config, handlers) {
  root.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "aez-panel";
  const header = document.createElement("div");
  header.className = "aez-header";
  const masterLabel = document.createElement("label");
  masterLabel.className = "aez-field aez-master-field";
  const master = document.createElement("input");
  master.type = "checkbox";
  master.className = "aez-master";
  master.checked = config.enabled;
  master.addEventListener("change", () => handlers.onToggleMaster(master.checked));
  const masterText = document.createElement("span");
  masterText.textContent = "Enabled";
  masterLabel.append(master, masterText);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "aez-add";
  add.textContent = "+ Add rule";
  add.addEventListener("click", () => handlers.onAddRule());
  header.append(masterLabel, add);
  const list = document.createElement("div");
  list.className = "aez-rules";
  for (const rule of config.rules)
    list.appendChild(buildRuleCard(rule, handlers));
  panel.append(header, list);
  root.appendChild(panel);
}

// src/ui/styles.ts
var PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, sans-serif; }

.aez-ez-button {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: #3893e8;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.aez-ez-button:hover { background: #2b7fd0; }

.aez-container {
  position: fixed;
  right: 16px;
  bottom: 70px;
  z-index: 2147483000;
  width: 340px;
  max-height: 70vh;
  overflow-y: auto;
  display: none;
  background: #2a2a2a;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  padding: 12px;
}
.aez-container.aez-open { display: block; }

.aez-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #444;
}

.aez-field { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.aez-master-field { font-weight: 700; }

.aez-add {
  background: #3893e8; color: #fff; border: none; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; font-size: 12px;
}
.aez-add:hover { background: #2b7fd0; }

.aez-rule {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 0; border-bottom: 1px solid #383838;
}
.aez-conditions { display: flex; flex-direction: column; gap: 4px; }
.aez-rule select, .aez-rule input[type="text"] {
  background: #1f1f1f; color: #ddd; border: 1px solid #555;
  border-radius: 4px; padding: 2px 4px; font-size: 12px;
}
.aez-message { flex: 1; min-width: 60px; }
.aez-delete {
  background: transparent; color: #c33; border: none;
  cursor: pointer; font-size: 14px; line-height: 1;
}
.aez-delete:hover { color: #f55; }
`;

// src/ui/mount.ts
var UI_ROOT_ID = "aez-root";
var ruleSeq = 0;
function newRule(config) {
  const maxOrder = config.rules.reduce((m, r) => Math.max(m, r.order), -1);
  ruleSeq += 1;
  return { id: `rule-${Date.now()}-${ruleSeq}`, enabled: true, order: maxOrder + 1, when: [], message: "" };
}
function patchRule(rule, patch) {
  let next = rule;
  if (patch.enabled !== undefined)
    next = { ...next, enabled: patch.enabled };
  if (patch.message !== undefined)
    next = { ...next, message: patch.message };
  if ("outcome" in patch)
    next = applySlot(next, "outcome", patch.outcome);
  if ("method" in patch)
    next = applySlot(next, "method", patch.method);
  if ("username" in patch)
    next = applySlot(next, "username", patch.username);
  if ("country" in patch)
    next = applySlot(next, "country", patch.country);
  return next;
}
function mountUI(storage, parent = document.body) {
  try {
    if (document.getElementById(UI_ROOT_ID))
      return;
    const hostEl = document.createElement("div");
    hostEl.id = UI_ROOT_ID;
    const shadow = hostEl.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "aez-ez-button";
    button.textContent = "ez";
    button.title = "auto-ez settings";
    const container = document.createElement("div");
    container.className = "aez-container";
    button.addEventListener("click", () => container.classList.toggle("aez-open"));
    shadow.append(style, button, container);
    const rerender = () => renderPanel(container, loadConfig(storage), handlers);
    const mutate = (fn) => {
      saveConfig(storage, fn(loadConfig(storage)));
      rerender();
    };
    const handlers = {
      onToggleMaster: (enabled) => mutate((c) => ({ ...c, enabled })),
      onAddRule: () => mutate((c) => ({ ...c, rules: [...c.rules, newRule(c)] })),
      onDeleteRule: (id) => mutate((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) })),
      onUpdateRule: (id, patch) => mutate((c) => ({ ...c, rules: c.rules.map((r) => r.id === id ? patchRule(r, patch) : r) }))
    };
    parent.appendChild(hostEl);
    rerender();
  } catch (err) {
    console.warn("[auto-ez] failed to mount UI", err);
  }
}

// src/main.ts
var LOG = "[auto-ez]";
var MIN_DELAY_MS = 500;
var MAX_DELAY_MS = 1500;
var DEBUG = true;
var pageScope = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : globalThis;
var storage = createDefaultStorage();
var gate = new SendGate(loadConfig(storage).globalCooldownMs);
var seenMessageTypes = new Set;
function debug(...args) {
  if (DEBUG)
    console.info(LOG, ...args);
}
function sendDelayMs() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}
function noteMessageType(type) {
  if (!DEBUG || !type || seenMessageTypes.has(type))
    return;
  seenMessageTypes.add(type);
  debug("socket message type seen:", type);
}
function explainEligibility() {
  if (!DEBUG)
    return;
  debug("eligibility check", {
    pathname: location.pathname,
    parsedId: parseGameId(location.pathname),
    orientation: readOrientation(document),
    opponent: readOpponent(document),
    isRealtime: isRealtime(document)
  });
}
function handleEndData(endData) {
  try {
    debug("endData received", endData);
    const config = loadConfig(storage);
    if (!config.enabled)
      return debug("disabled; ignoring");
    const context = getEligibleContext(document, location.pathname);
    if (!context) {
      explainEligibility();
      return debug("not an eligible game (spectating / vs computer / correspondence)");
    }
    context.opponent.country = getCachedCountry(context.opponent.username ?? "");
    const result = normalizeEndData(endData, context);
    debug("normalized result", result);
    const rule = matchRule(result, config.rules);
    if (!rule)
      return debug("no rule matched");
    debug("matched rule", rule.id, "->", rule.message);
    if (rule.message.trim() === "")
      return debug("rule message blank; skipping");
    if (!gate.tryClaim(rule, result.gameId, Date.now()))
      return debug("blocked by dedupe/cooldown");
    const message = rule.message;
    setTimeout(() => {
      try {
        const sent = typeAndSend(document, message);
        if (sent)
          debug("sent:", message);
        else
          console.warn(`${LOG} chat input not found; message not sent`);
      } catch (err) {
        console.warn(`${LOG} send failed`, err);
      }
    }, sendDelayMs());
  } catch (err) {
    console.warn(`${LOG} end-of-game handling failed`, err);
  }
}
function prefetchOpponentCountry() {
  try {
    const context = getEligibleContext(document, location.pathname);
    const username = context?.opponent.username;
    if (username)
      prefetchCountry(username);
  } catch (err) {
    console.warn(`${LOG} country prefetch failed`, err);
  }
}
function startCountryPrefetch() {
  prefetchOpponentCountry();
  try {
    const observer = new MutationObserver(() => prefetchOpponentCountry());
    const target = document.body ?? document.documentElement;
    if (target)
      observer.observe(target, { childList: true, subtree: true });
  } catch (err) {
    console.warn(`${LOG} country watcher failed`, err);
  }
}
function registerMenu() {
  if (typeof GM_registerMenuCommand !== "function")
    return;
  GM_registerMenuCommand("auto-ez: toggle on/off", () => {
    const next = !loadConfig(storage).enabled;
    setEnabled(storage, next);
    console.info(`${LOG} ${next ? "enabled" : "disabled"}`);
  });
}
function mountWhenReady() {
  if (document.body) {
    mountUI(storage);
  } else {
    document.addEventListener("DOMContentLoaded", () => mountUI(storage), { once: true });
  }
}
function main() {
  try {
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

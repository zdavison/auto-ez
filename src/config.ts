/**
 * Configuration: the rules table, the master on/off toggle, and an anti-spam
 * floor. Persisted as JSON through a {@link Storage} adapter.
 */
import type { Storage } from "./storage.ts";
import type { Rule } from "./matcher.ts";

export interface Config {
  /** Master on/off switch. @default true */
  enabled: boolean;
  rules: Rule[];
  /** Minimum gap between any two sent messages, in milliseconds. @default 3000 */
  globalCooldownMs: number;
}

const STORAGE_KEY = "auto-ez:config";

/** Shipped defaults: enabled, with the single `win + outoftime -> "ez"` rule. */
export const DEFAULT_CONFIG: Config = {
  enabled: true,
  globalCooldownMs: 3000,
  rules: [
    {
      id: "ez-on-flag",
      enabled: true,
      order: 0,
      when: [
        { type: "outcome", value: "win" },
        { type: "method", value: "outoftime" },
      ],
      message: "ez",
    },
  ],
};

/** Load config from storage, returning the default if absent or corrupt. */
export function loadConfig(storage: Storage): Config {
  const raw = storage.get(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_CONFIG);
  try {
    return JSON.parse(raw) as Config;
  } catch {
    console.warn("[auto-ez] stored config is corrupt; using defaults");
    return structuredClone(DEFAULT_CONFIG);
  }
}

/** Persist config to storage. */
export function saveConfig(storage: Storage, config: Config): void {
  storage.set(STORAGE_KEY, JSON.stringify(config));
}

/** Set the master toggle, persist, and return the updated config. */
export function setEnabled(storage: Storage, enabled: boolean): Config {
  const config = { ...loadConfig(storage), enabled };
  saveConfig(storage, config);
  return config;
}

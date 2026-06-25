import { test, expect, describe } from "bun:test";
import { DEFAULT_CONFIG, loadConfig, saveConfig, setEnabled } from "../src/config.ts";
import type { Storage } from "../src/storage.ts";

/** In-memory Storage adapter for tests. */
function mockStorage(initial: Record<string, string> = {}): Storage & { raw: Record<string, string> } {
  const raw = { ...initial };
  return {
    raw,
    get(key) {
      return key in raw ? raw[key]! : null;
    },
    set(key, value) {
      raw[key] = value;
    },
  };
}

describe("DEFAULT_CONFIG", () => {
  test("ships a single enabled ez-on-flag rule", () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.rules).toHaveLength(1);
    const rule = DEFAULT_CONFIG.rules[0]!;
    expect(rule.message).toBe("ez");
    expect(rule.when).toEqual([
      { type: "outcome", value: "win" },
      { type: "method", value: "outoftime" },
    ]);
  });
});

describe("loadConfig", () => {
  test("returns the default config when storage is empty", () => {
    expect(loadConfig(mockStorage())).toEqual(DEFAULT_CONFIG);
  });

  test("returns the stored config when present", () => {
    const storage = mockStorage();
    const custom = { ...DEFAULT_CONFIG, enabled: false };
    saveConfig(storage, custom);
    expect(loadConfig(storage)).toEqual(custom);
  });

  test("falls back to default when stored value is corrupt", () => {
    const storage = mockStorage({ "auto-ez:config": "not json{" });
    expect(loadConfig(storage)).toEqual(DEFAULT_CONFIG);
  });
});

describe("setEnabled", () => {
  test("persists the master toggle and returns the updated config", () => {
    const storage = mockStorage();
    const updated = setEnabled(storage, false);
    expect(updated.enabled).toBe(false);
    expect(loadConfig(storage).enabled).toBe(false);
  });
});

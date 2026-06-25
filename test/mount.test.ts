import { test, expect, describe, beforeEach } from "bun:test";
import { mountUI, UI_ROOT_ID } from "../src/ui/mount.ts";
import { loadConfig, DEFAULT_CONFIG } from "../src/config.ts";
import type { Storage } from "../src/storage.ts";

function mockStorage(): Storage {
  const raw: Record<string, string> = {};
  return {
    get: (k) => (k in raw ? raw[k]! : null),
    set: (k, v) => {
      raw[k] = v;
    },
  };
}

let storage: Storage;

beforeEach(() => {
  document.body.innerHTML = "";
  storage = mockStorage();
});

const host = () => document.getElementById(UI_ROOT_ID)!;
const shadow = () => host().shadowRoot!;

describe("mountUI", () => {
  test("injects exactly one host with an ez button and a panel container", () => {
    mountUI(storage);
    expect(document.querySelectorAll(`#${UI_ROOT_ID}`)).toHaveLength(1);
    expect(shadow().querySelector(".aez-ez-button")!.textContent).toBe("ez");
    expect(shadow().querySelector(".aez-container")).not.toBeNull();
  });

  test("is idempotent — mounting twice keeps a single host", () => {
    mountUI(storage);
    mountUI(storage);
    expect(document.querySelectorAll(`#${UI_ROOT_ID}`)).toHaveLength(1);
  });

  test("clicking the ez button toggles the panel open state", () => {
    mountUI(storage);
    const container = shadow().querySelector(".aez-container")!;
    const button = shadow().querySelector<HTMLButtonElement>(".aez-ez-button")!;
    expect(container.classList.contains("aez-open")).toBe(false);
    button.click();
    expect(container.classList.contains("aez-open")).toBe(true);
    button.click();
    expect(container.classList.contains("aez-open")).toBe(false);
  });

  test("toggling the master switch persists to storage", () => {
    mountUI(storage);
    const master = shadow().querySelector<HTMLInputElement>(".aez-master")!;
    master.checked = false;
    master.dispatchEvent(new Event("change", { bubbles: true }));
    expect(loadConfig(storage).enabled).toBe(false);
  });

  test("adding a rule persists a new rule and re-renders a card for it", () => {
    mountUI(storage);
    shadow().querySelector<HTMLButtonElement>(".aez-add")!.click();
    expect(loadConfig(storage).rules.length).toBe(DEFAULT_CONFIG.rules.length + 1);
    expect(shadow().querySelectorAll(".aez-rule").length).toBe(DEFAULT_CONFIG.rules.length + 1);
  });

  test("editing a rule's outcome persists via slots", () => {
    mountUI(storage);
    const sel = shadow().querySelector<HTMLSelectElement>(".aez-rule .aez-outcome")!;
    sel.value = "loss";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    const rule = loadConfig(storage).rules[0]!;
    expect(rule.when.find((c) => c.type === "outcome")).toEqual({ type: "outcome", value: "loss" });
  });
});

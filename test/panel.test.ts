import { test, expect, describe, beforeEach, mock } from "bun:test";
import { renderPanel, type PanelHandlers } from "../src/ui/panel.ts";
import type { Config } from "../src/config.ts";

function makeConfig(): Config {
  return {
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
      { id: "blank", enabled: false, order: 1, when: [], message: "" },
    ],
  };
}

function makeHandlers(): PanelHandlers {
  return {
    onToggleMaster: mock(),
    onAddRule: mock(),
    onDeleteRule: mock(),
    onUpdateRule: mock(),
  };
}

let root: HTMLElement;
let handlers: PanelHandlers;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
  handlers = makeHandlers();
});

const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
const qa = (sel: string) => [...root.querySelectorAll(sel)];

describe("renderPanel", () => {
  test("renders the master toggle reflecting config.enabled", () => {
    renderPanel(root, makeConfig(), handlers);
    expect(q<HTMLInputElement>(".abm-master").checked).toBe(true);
  });

  test("renders one card per rule", () => {
    renderPanel(root, makeConfig(), handlers);
    expect(qa(".abm-rule")).toHaveLength(2);
  });

  test("preselects each rule's outcome, method and message", () => {
    renderPanel(root, makeConfig(), handlers);
    const card = q(".abm-rule[data-rule-id='ez-on-flag']");
    expect(card.querySelector<HTMLSelectElement>(".abm-outcome")!.value).toBe("win");
    expect(card.querySelector<HTMLSelectElement>(".abm-method")!.value).toBe("outoftime");
    expect(card.querySelector<HTMLInputElement>(".abm-message")!.value).toBe("ez");
    expect(card.querySelector<HTMLInputElement>(".abm-enabled")!.checked).toBe(true);
  });

  test("an absent condition shows the empty option", () => {
    renderPanel(root, makeConfig(), handlers);
    const card = q(".abm-rule[data-rule-id='blank']");
    expect(card.querySelector<HTMLSelectElement>(".abm-outcome")!.value).toBe("");
    expect(card.querySelector<HTMLSelectElement>(".abm-method")!.value).toBe("");
  });

  test("toggling the master switch calls onToggleMaster", () => {
    renderPanel(root, makeConfig(), handlers);
    const master = q<HTMLInputElement>(".abm-master");
    master.checked = false;
    master.dispatchEvent(new Event("change", { bubbles: true }));
    expect(handlers.onToggleMaster).toHaveBeenCalledWith(false);
  });

  test("clicking add calls onAddRule", () => {
    renderPanel(root, makeConfig(), handlers);
    q<HTMLButtonElement>(".abm-add").click();
    expect(handlers.onAddRule).toHaveBeenCalled();
  });

  test("clicking delete calls onDeleteRule with the rule id", () => {
    renderPanel(root, makeConfig(), handlers);
    q<HTMLButtonElement>(".abm-rule[data-rule-id='blank'] .abm-delete").click();
    expect(handlers.onDeleteRule).toHaveBeenCalledWith("blank");
  });

  test("editing the message calls onUpdateRule with the new message", () => {
    renderPanel(root, makeConfig(), handlers);
    const input = q<HTMLInputElement>(".abm-rule[data-rule-id='ez-on-flag'] .abm-message");
    input.value = "gg";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(handlers.onUpdateRule).toHaveBeenCalledWith("ez-on-flag", { message: "gg" });
  });

  test("changing the outcome calls onUpdateRule with the new outcome", () => {
    renderPanel(root, makeConfig(), handlers);
    const sel = q<HTMLSelectElement>(".abm-rule[data-rule-id='ez-on-flag'] .abm-outcome");
    sel.value = "loss";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(handlers.onUpdateRule).toHaveBeenCalledWith("ez-on-flag", { outcome: "loss" });
  });

  test("selecting the empty option calls onUpdateRule with undefined", () => {
    renderPanel(root, makeConfig(), handlers);
    const sel = q<HTMLSelectElement>(".abm-rule[data-rule-id='ez-on-flag'] .abm-method");
    sel.value = "";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(handlers.onUpdateRule).toHaveBeenCalledWith("ez-on-flag", { method: undefined });
  });
});

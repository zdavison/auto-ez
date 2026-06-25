import { test, expect, describe } from "bun:test";
import { ruleToSlots, applySlot } from "../src/ui/slots.ts";
import type { Rule } from "../src/matcher.ts";

const rule = (when: Rule["when"]): Rule => ({ id: "r", enabled: true, order: 0, when, message: "ez" });

describe("ruleToSlots", () => {
  test("extracts outcome and method values from conditions", () => {
    const r = rule([
      { type: "outcome", value: "win" },
      { type: "method", value: "outoftime" },
    ]);
    expect(ruleToSlots(r)).toEqual({ outcome: "win", method: "outoftime" });
  });

  test("leaves a slot undefined when its condition is absent", () => {
    expect(ruleToSlots(rule([{ type: "outcome", value: "loss" }]))).toEqual({ outcome: "loss" });
    expect(ruleToSlots(rule([]))).toEqual({});
  });
});

describe("applySlot", () => {
  test("sets a slot value, adding the condition", () => {
    const r = applySlot(rule([]), "outcome", "win");
    expect(r.when).toEqual([{ type: "outcome", value: "win" }]);
  });

  test("replaces an existing condition of the same type", () => {
    const r = applySlot(rule([{ type: "outcome", value: "win" }]), "outcome", "loss");
    expect(r.when).toEqual([{ type: "outcome", value: "loss" }]);
  });

  test("removes the condition when value is undefined", () => {
    const r = applySlot(rule([{ type: "method", value: "mate" }]), "method", undefined);
    expect(r.when).toEqual([]);
  });

  test("preserves conditions of other types when editing one slot", () => {
    const r = applySlot(
      rule([
        { type: "outcome", value: "win" },
        { type: "method", value: "mate" },
      ]),
      "method",
      "outoftime",
    );
    expect(r.when).toEqual([
      { type: "outcome", value: "win" },
      { type: "method", value: "outoftime" },
    ]);
  });

  test("does not mutate the input rule", () => {
    const original = rule([{ type: "outcome", value: "win" }]);
    applySlot(original, "outcome", "loss");
    expect(original.when).toEqual([{ type: "outcome", value: "win" }]);
  });
});

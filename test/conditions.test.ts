import { test, expect, describe } from "bun:test";
import { evaluateCondition, PROPERTY_PRIORITY } from "../src/conditions/index.ts";
import type { GameResult } from "../src/types.ts";

const baseResult: GameResult = {
  gameId: "abcd1234",
  outcome: "win",
  method: "outoftime",
  ourColor: "white",
  opponent: { username: "bob", rating: 1500 },
  raw: {},
};

describe("evaluateCondition", () => {
  test("outcome condition matches when outcome equals value", () => {
    expect(evaluateCondition({ type: "outcome", value: "win" }, baseResult)).toBe(true);
  });

  test("outcome condition fails when outcome differs", () => {
    expect(evaluateCondition({ type: "outcome", value: "loss" }, baseResult)).toBe(false);
  });

  test("method condition matches when method equals value", () => {
    expect(evaluateCondition({ type: "method", value: "outoftime" }, baseResult)).toBe(true);
  });

  test("method condition fails when method differs", () => {
    expect(evaluateCondition({ type: "method", value: "mate" }, baseResult)).toBe(false);
  });
});

describe("PROPERTY_PRIORITY", () => {
  test("orders properties most-specific first", () => {
    expect(PROPERTY_PRIORITY.country!).toBeGreaterThan(PROPERTY_PRIORITY.username!);
    expect(PROPERTY_PRIORITY.username!).toBeGreaterThan(PROPERTY_PRIORITY.material!);
    expect(PROPERTY_PRIORITY.material!).toBeGreaterThan(PROPERTY_PRIORITY.method!);
    expect(PROPERTY_PRIORITY.method!).toBeGreaterThan(PROPERTY_PRIORITY.outcome!);
  });
});

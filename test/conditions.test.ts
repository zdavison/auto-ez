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

  // --- username (regex, case-insensitive, partial) ---
  test("username condition matches a partial, case-insensitive regex", () => {
    expect(evaluateCondition({ type: "username", value: "BO" }, baseResult)).toBe(true);
  });

  test("username condition honours anchors", () => {
    expect(evaluateCondition({ type: "username", value: "^bob$" }, baseResult)).toBe(true);
    expect(evaluateCondition({ type: "username", value: "^ob" }, baseResult)).toBe(false);
  });

  test("username condition fails when the opponent has no username", () => {
    const noName: GameResult = { ...baseResult, opponent: {} };
    expect(evaluateCondition({ type: "username", value: ".*" }, noName)).toBe(false);
  });

  test("username condition with an invalid regex never matches and never throws", () => {
    expect(evaluateCondition({ type: "username", value: "[" }, baseResult)).toBe(false);
  });

  // --- country (comma-separated flag codes, case-insensitive) ---
  const us: GameResult = { ...baseResult, opponent: { username: "bob", country: "US" } };

  test("country condition matches a single code, case-insensitively", () => {
    expect(evaluateCondition({ type: "country", value: "us" }, us)).toBe(true);
  });

  test("country condition matches any code in a comma-separated list", () => {
    expect(evaluateCondition({ type: "country", value: "CA, US, GB-ENG" }, us)).toBe(true);
  });

  test("country condition fails when the code is not in the list", () => {
    expect(evaluateCondition({ type: "country", value: "CA, JP" }, us)).toBe(false);
  });

  test("country condition fails when the opponent has no country", () => {
    expect(evaluateCondition({ type: "country", value: "US" }, baseResult)).toBe(false);
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

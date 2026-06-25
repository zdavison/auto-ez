import { test, expect, describe } from "bun:test";
import { selectMessage, matchRule, type Rule } from "../src/matcher.ts";
import type { GameResult } from "../src/types.ts";

const result: GameResult = {
  gameId: "abcd1234",
  outcome: "win",
  method: "outoftime",
  ourColor: "white",
  opponent: { username: "bob" },
  raw: {},
};

function rule(partial: Partial<Rule> & Pick<Rule, "id" | "when" | "message">): Rule {
  return { enabled: true, ...partial };
}

describe("selectMessage", () => {
  test("returns the message of a rule whose conditions all match", () => {
    const rules = [
      rule({
        id: "ez",
        when: [
          { type: "outcome", value: "win" },
          { type: "method", value: "outoftime" },
        ],
        message: "ez",
      }),
    ];
    expect(selectMessage(result, rules)).toBe("ez");
  });

  test("returns null when no rule matches", () => {
    const rules = [rule({ id: "gg", when: [{ type: "outcome", value: "loss" }], message: "gg" })];
    expect(selectMessage(result, rules)).toBeNull();
  });

  test("requires ALL conditions in a rule to match (AND)", () => {
    const rules = [
      rule({
        id: "mixed",
        when: [
          { type: "outcome", value: "win" },
          { type: "method", value: "mate" }, // does not match (outoftime)
        ],
        message: "nope",
      }),
    ];
    expect(selectMessage(result, rules)).toBeNull();
  });

  test("skips disabled rules", () => {
    const rules = [
      rule({ id: "off", enabled: false, when: [{ type: "outcome", value: "win" }], message: "off" }),
      rule({ id: "on", when: [{ type: "outcome", value: "win" }], message: "on" }),
    ];
    expect(selectMessage(result, rules)).toBe("on");
  });

  test("list order is priority: the first matching rule wins", () => {
    const first = rule({ id: "first", when: [{ type: "outcome", value: "win" }], message: "first" });
    const second = rule({
      id: "second",
      when: [
        { type: "outcome", value: "win" },
        { type: "method", value: "outoftime" },
      ],
      message: "second",
    });
    // The broader rule listed first wins, even though `second` is more specific.
    expect(selectMessage(result, [first, second])).toBe("first");
  });

  test("reordering changes the winner", () => {
    const a = rule({ id: "a", when: [{ type: "outcome", value: "win" }], message: "a" });
    const b = rule({ id: "b", when: [{ type: "outcome", value: "win" }], message: "b" });
    expect(selectMessage(result, [a, b])).toBe("a");
    expect(selectMessage(result, [b, a])).toBe("b");
  });
});

describe("matchRule", () => {
  test("returns the first matching enabled rule, not just its message", () => {
    const rules = [
      rule({ id: "ez", when: [{ type: "outcome", value: "win" }], message: "ez" }),
    ];
    expect(matchRule(result, rules)?.id).toBe("ez");
  });

  test("returns null when nothing matches", () => {
    expect(matchRule(result, [rule({ id: "x", when: [{ type: "outcome", value: "loss" }], message: "" })])).toBeNull();
  });

  test("a disabled rule earlier in the list does not shadow a later matching one", () => {
    const rules = [
      rule({ id: "off", enabled: false, when: [{ type: "outcome", value: "win" }], message: "off" }),
      rule({ id: "on", when: [{ type: "outcome", value: "win" }], message: "on" }),
    ];
    expect(matchRule(result, rules)?.id).toBe("on");
  });
});

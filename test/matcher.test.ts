import { test, expect, describe } from "bun:test";
import { selectMessage, matchRule, sortRules, type Rule } from "../src/matcher.ts";
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
  return { enabled: true, order: 0, ...partial };
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

  test("more specific (more conditions) rule wins over a broader one", () => {
    const broad = rule({ id: "broad", order: 0, when: [{ type: "outcome", value: "win" }], message: "broad" });
    const specific = rule({
      id: "specific",
      order: 1, // later insertion, but more conditions => should still win
      when: [
        { type: "outcome", value: "win" },
        { type: "method", value: "outoftime" },
      ],
      message: "specific",
    });
    expect(selectMessage(result, [broad, specific])).toBe("specific");
  });
});

describe("matchRule", () => {
  test("returns the winning rule, not just its message", () => {
    const rules = [
      rule({ id: "ez", when: [{ type: "outcome", value: "win" }], message: "ez" }),
    ];
    expect(matchRule(result, rules)?.id).toBe("ez");
  });

  test("returns null when nothing matches", () => {
    expect(matchRule(result, [rule({ id: "x", when: [{ type: "outcome", value: "loss" }], message: "" })])).toBeNull();
  });
});

describe("sortRules", () => {
  test("primary: more conditions ranks higher", () => {
    const a = rule({ id: "a", when: [{ type: "outcome", value: "win" }], message: "" });
    const b = rule({
      id: "b",
      when: [
        { type: "outcome", value: "win" },
        { type: "method", value: "mate" },
      ],
      message: "",
    });
    expect(sortRules([a, b]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("tiebreak: among equal counts, higher-priority property ranks first", () => {
    // Both 2-condition. Country (100) outranks method (50) on the top weight.
    const countryRule = rule({
      id: "country",
      // country isn't a v1 predicate, but ordering keys off the property type only.
      when: [
        { type: "country", value: "FR" },
        { type: "outcome", value: "win" },
      ] as unknown as Rule["when"],
      message: "",
    });
    const methodRule = rule({
      id: "method",
      when: [
        { type: "method", value: "mate" },
        { type: "outcome", value: "win" },
      ],
      message: "",
    });
    expect(sortRules([methodRule, countryRule]).map((r) => r.id)).toEqual(["country", "method"]);
  });

  test("final tiebreak: lower order first for otherwise-identical rules", () => {
    const second = rule({ id: "second", order: 5, when: [{ type: "outcome", value: "win" }], message: "" });
    const first = rule({ id: "first", order: 1, when: [{ type: "outcome", value: "win" }], message: "" });
    expect(sortRules([second, first]).map((r) => r.id)).toEqual(["first", "second"]);
  });

  test("sorts country above username above method above outcome on the weight tiebreak", () => {
    const mk = (id: string, type: "country" | "username" | "method" | "outcome", value: string) => ({
      id,
      enabled: true,
      order: 0,
      when: [{ type, value } as const],
      message: id,
    });
    const rules = [
      mk("outcome", "outcome", "win"),
      mk("method", "method", "mate"),
      mk("username", "username", "bob"),
      mk("country", "country", "US"),
    ];
    expect(sortRules(rules).map((r) => r.id)).toEqual(["country", "username", "method", "outcome"]);
  });
});

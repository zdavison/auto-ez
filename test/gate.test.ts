import { test, expect, describe } from "bun:test";
import { SendGate } from "../src/gate.ts";
import type { Rule } from "../src/matcher.ts";

const rule = (id: string, cooldownMs?: number): Rule => ({
  id,
  enabled: true,
  order: 0,
  when: [{ type: "outcome", value: "win" }],
  message: "ez",
  cooldownMs,
});

describe("SendGate", () => {
  test("allows the first send for a game", () => {
    const gate = new SendGate(3000);
    expect(gate.tryClaim(rule("a"), "game1", 1000)).toBe(true);
  });

  test("blocks a second send for the same game (dedupe)", () => {
    const gate = new SendGate(0);
    gate.tryClaim(rule("a"), "game1", 1000);
    expect(gate.tryClaim(rule("a"), "game1", 99999)).toBe(false);
  });

  test("blocks a send within the global cooldown across different games", () => {
    const gate = new SendGate(3000);
    gate.tryClaim(rule("a"), "game1", 1000);
    expect(gate.tryClaim(rule("a"), "game2", 2000)).toBe(false); // only 1s later
  });

  test("allows a send once the global cooldown has elapsed", () => {
    const gate = new SendGate(3000);
    gate.tryClaim(rule("a"), "game1", 1000);
    expect(gate.tryClaim(rule("a"), "game2", 4500)).toBe(true);
  });

  test("honors a per-rule cooldown", () => {
    const gate = new SendGate(0);
    gate.tryClaim(rule("a", 10000), "game1", 1000);
    expect(gate.tryClaim(rule("a", 10000), "game2", 5000)).toBe(false); // rule cooldown not elapsed
    expect(gate.tryClaim(rule("a", 10000), "game3", 12000)).toBe(true);
  });
});

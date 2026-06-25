import { test, expect, describe } from "bun:test";
import { methodFromStatus, outcomeFromWinner, normalizeEndData, type EndData } from "../src/detector/result.ts";

describe("methodFromStatus", () => {
  test("uses the status name when present", () => {
    expect(methodFromStatus({ id: 35, name: "outoftime" })).toBe("outoftime");
    expect(methodFromStatus({ id: 30, name: "mate" })).toBe("mate");
  });

  test("falls back to the numeric id when name is missing", () => {
    expect(methodFromStatus({ id: 31 })).toBe("resign");
    expect(methodFromStatus({ id: 60 })).toBe("variantEnd");
  });

  test("maps unrecognized status to 'unknown'", () => {
    expect(methodFromStatus({ id: 999 })).toBe("unknown");
    expect(methodFromStatus({})).toBe("unknown");
  });
});

describe("outcomeFromWinner", () => {
  test("win when winner is our color", () => {
    expect(outcomeFromWinner("white", "white")).toBe("win");
  });

  test("loss when winner is the opponent", () => {
    expect(outcomeFromWinner("black", "white")).toBe("loss");
  });

  test("draw when there is no winner", () => {
    expect(outcomeFromWinner(undefined, "white")).toBe("draw");
  });
});

describe("normalizeEndData", () => {
  test("produces a GameResult for a win on time", () => {
    const endData = { winner: "white", status: { id: 35, name: "outoftime" } } satisfies EndData;
    const result = normalizeEndData(endData, {
      gameId: "abcd1234",
      ourColor: "white",
      opponent: { username: "bob", rating: 1500 },
    });
    expect(result).toMatchObject({
      gameId: "abcd1234",
      outcome: "win",
      method: "outoftime",
      ourColor: "white",
      opponent: { username: "bob", rating: 1500 },
    });
    expect(result.raw).toBe(endData);
  });
});

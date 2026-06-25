import { test, expect, describe, beforeEach } from "bun:test";
import { parseGameId, readOrientation, readOpponent, isRealtime, getEligibleContext } from "../src/detector/pageContext.ts";

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Build a round page fragment for a game we play (white) vs a human, with a live clock. */
function renderHumanGame(): void {
  document.body.innerHTML = `
    <div class="round__app">
      <div class="cg-wrap orientation-white"></div>
      <div class="rclock rclock-top rclock-black"><div class="time">2:00</div></div>
      <div class="ruser-top ruser user-link">
        <a class="user-link" href="/@/bob"><span class="utitle">GM&nbsp;</span>bob</a>
        <rating>2400</rating>
      </div>
      <div class="rclock rclock-bottom rclock-white"><div class="time">1:58</div></div>
      <div class="ruser-bottom ruser user-link"><a class="user-link" href="/@/me">me</a></div>
    </div>`;
}

describe("parseGameId", () => {
  test("recognizes a player's full 12-char game id", () => {
    expect(parseGameId("/abcd1234WXYZ")).toEqual({ gameId: "abcd1234", isPlayer: true });
  });

  test("recognizes a spectator's 8-char game id as not-playing", () => {
    expect(parseGameId("/abcd1234")).toEqual({ gameId: "abcd1234", isPlayer: false });
  });

  test("ignores trailing color segments", () => {
    expect(parseGameId("/abcd1234/black")).toEqual({ gameId: "abcd1234", isPlayer: false });
  });

  test("returns null for non-game paths", () => {
    expect(parseGameId("/")).toBeNull();
    expect(parseGameId("/training/abc")).toBeNull();
  });
});

describe("readOrientation", () => {
  test("reads our color from the board orientation", () => {
    renderHumanGame();
    expect(readOrientation(document)).toBe("white");
  });

  test("returns null when no oriented board is present", () => {
    expect(readOrientation(document)).toBeNull();
  });
});

describe("readOpponent", () => {
  test("reads username, title and rating of a human opponent", () => {
    renderHumanGame();
    expect(readOpponent(document)).toEqual({ username: "bob", title: "GM", rating: 2400, isAi: false });
  });

  test("flags an AI opponent (no user link)", () => {
    document.body.innerHTML = `
      <div class="ruser-top ruser user-link"><name>Stockfish level 5</name></div>`;
    expect(readOpponent(document)?.isAi).toBe(true);
  });
});

describe("isRealtime", () => {
  test("true when a live clock with a time is present", () => {
    renderHumanGame();
    expect(isRealtime(document)).toBe(true);
  });

  test("false for a correspondence clock", () => {
    document.body.innerHTML = `<div class="rclock rclock-turn rclock-bottom"><div class="rclock-turn__text">1 day</div></div>`;
    expect(isRealtime(document)).toBe(false);
  });
});

describe("getEligibleContext", () => {
  test("returns context for a real-time game vs a human that we are playing", () => {
    renderHumanGame();
    const ctx = getEligibleContext(document, "/abcd1234WXYZ");
    expect(ctx).toEqual({
      gameId: "abcd1234",
      ourColor: "white",
      opponent: { username: "bob", title: "GM", rating: 2400 },
    });
  });

  test("returns null when we are only spectating", () => {
    renderHumanGame();
    expect(getEligibleContext(document, "/abcd1234")).toBeNull();
  });

  test("returns null when the opponent is the computer", () => {
    document.body.innerHTML = `
      <div class="cg-wrap orientation-white"></div>
      <div class="rclock rclock-top"><div class="time">2:00</div></div>
      <div class="ruser-top ruser user-link"><name>Stockfish level 5</name></div>`;
    expect(getEligibleContext(document, "/abcd1234WXYZ")).toBeNull();
  });

  test("returns null for a correspondence game", () => {
    document.body.innerHTML = `
      <div class="cg-wrap orientation-white"></div>
      <div class="rclock rclock-turn rclock-top"><div class="rclock-turn__text">1 day</div></div>
      <div class="ruser-top ruser user-link"><a class="user-link" href="/@/bob">bob</a></div>`;
    expect(getEligibleContext(document, "/abcd1234WXYZ")).toBeNull();
  });
});

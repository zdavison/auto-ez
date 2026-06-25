import { test, expect, describe, beforeEach } from "bun:test";
import { typeAndSend, CHAT_INPUT_SELECTOR, MAX_MESSAGE_LENGTH } from "../src/sender.ts";

/**
 * Mimic lichess's chat handler: on Enter keydown, capture the input's current value
 * and clear it (as `ctrl.post` + `el.value = ''` would).
 */
function attachLichessLikeChat(): { sent: string[] } {
  const sent: string[] = [];
  document.body.innerHTML = `<div class="mchat"><input class="mchat__say" maxlength="140" /></div>`;
  const input = document.querySelector<HTMLInputElement>(CHAT_INPUT_SELECTOR)!;
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Enter") return;
    sent.push(input.value);
    input.value = "";
  });
  return { sent };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("typeAndSend", () => {
  test("types the message and triggers a send via Enter", () => {
    const chat = attachLichessLikeChat();
    const ok = typeAndSend(document, "ez");
    expect(ok).toBe(true);
    expect(chat.sent).toEqual(["ez"]);
  });

  test("dispatches an input event so lichess's draft state updates", () => {
    attachLichessLikeChat();
    const input = document.querySelector<HTMLInputElement>(CHAT_INPUT_SELECTOR)!;
    const inputEvents: string[] = [];
    input.addEventListener("input", () => inputEvents.push(input.value));
    typeAndSend(document, "gg");
    expect(inputEvents).toEqual(["gg"]);
  });

  test("returns false and does not throw when the chat input is absent", () => {
    document.body.innerHTML = `<div>no chat here</div>`;
    expect(typeAndSend(document, "ez")).toBe(false);
  });

  test("truncates messages longer than the lichess limit", () => {
    const chat = attachLichessLikeChat();
    typeAndSend(document, "x".repeat(200));
    expect(chat.sent[0]!.length).toBe(MAX_MESSAGE_LENGTH);
  });
});

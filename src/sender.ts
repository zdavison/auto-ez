/**
 * Sender: type a message into lichess's chat input and submit it.
 *
 * We drive the real `input.mchat__say` element rather than posting to the socket
 * directly, so the message goes through lichess's own draft handling, spam check,
 * and flood control. Lichess sends on a keydown Enter that reads `el.value`, so we
 * set the value, fire an `input` event (updates its draft state), then a keydown
 * Enter.
 *
 * @see https://github.com/lichess-org/lila/blob/master/ui/lib/src/chat/discussion.ts
 */

/** Selector for the round chat text input. */
export const CHAT_INPUT_SELECTOR = "input.mchat__say";

/** Lichess chat message length limit (`maxlength` on the input). */
export const MAX_MESSAGE_LENGTH = 140;

/**
 * Type `message` into the chat input under `root` and submit it.
 * Returns `true` if the input was found and the send was dispatched, `false`
 * otherwise (e.g. chat disabled/absent). Never throws.
 */
export function typeAndSend(root: Document | HTMLElement, message: string): boolean {
  if (message.trim() === "") return false; // never send blank (e.g. half-configured rule)
  const input = root.querySelector<HTMLInputElement>(CHAT_INPUT_SELECTOR);
  if (!input) return false;

  input.value = message.slice(0, MAX_MESSAGE_LENGTH);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
  );
  return true;
}

/**
 * WebSocket hook.
 *
 * Lichess's round page talks to its socket server over a WebSocket. When a game
 * ends, the server pushes a `{t:"endData", d:{winner?, status, ...}}` frame. We wrap
 * the WebSocket constructor so every socket the page opens also notifies us of any
 * `endData` frame — we only listen, we never interfere with the page's own handling.
 *
 * Must be installed at `document-start`, before lichess constructs its socket.
 */
import type { EndData } from "./result.ts";

interface WebSocketScope {
  WebSocket: typeof WebSocket;
}

/**
 * Wrap `scope.WebSocket` so `onEndData` is called with the payload of every
 * `endData` frame. Returns a function that restores the original constructor.
 */
export function installWebSocketHook(
  onEndData: (data: EndData) => void,
  scope: WebSocketScope = globalThis,
): () => void {
  const Original = scope.WebSocket;

  class HookedWebSocket extends Original {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event: Event) => {
        try {
          const data = (event as MessageEvent).data;
          if (typeof data !== "string") return;
          const parsed = JSON.parse(data) as { t?: string; d?: unknown };
          if (parsed?.t === "endData" && parsed.d) onEndData(parsed.d as EndData);
        } catch {
          // Not our message or not JSON; ignore so we never disturb the page.
        }
      });
    }
  }

  scope.WebSocket = HookedWebSocket as unknown as typeof WebSocket;
  return () => {
    scope.WebSocket = Original;
  };
}

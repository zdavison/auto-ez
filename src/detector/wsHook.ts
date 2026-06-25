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

export interface WebSocketHookOptions {
  /** Restrict which scope's WebSocket constructor is wrapped (defaults to globalThis). */
  scope?: WebSocketScope;
  /**
   * Debug-only: called with the `t` field of every successfully-parsed inbound
   * message, before the `endData` filter. Used to confirm which frame types the
   * page actually receives. Errors thrown here are swallowed.
   */
  onMessageType?: (type: string | undefined) => void;
}

/**
 * Wrap `scope.WebSocket` so `onEndData` is called with the payload of every
 * `endData` frame. Returns a function that restores the original constructor.
 */
export function installWebSocketHook(
  onEndData: (data: EndData) => void,
  options: WebSocketScope | WebSocketHookOptions = {},
): () => void {
  // Back-compat: a bare scope may be passed as the second arg.
  const opts: WebSocketHookOptions =
    "WebSocket" in options ? { scope: options as WebSocketScope } : (options as WebSocketHookOptions);
  const scope = opts.scope ?? globalThis;
  const Original = scope.WebSocket;

  class HookedWebSocket extends Original {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event: Event) => {
        try {
          const data = (event as MessageEvent).data;
          if (typeof data !== "string") return;
          const parsed = JSON.parse(data) as { t?: string; d?: unknown };
          opts.onMessageType?.(parsed?.t);
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

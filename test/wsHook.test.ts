import { test, expect, describe } from "bun:test";
import { installWebSocketHook } from "../src/detector/wsHook.ts";
import type { EndData } from "../src/detector/result.ts";

/** Minimal stand-in for the global WebSocket: never connects; lets tests inject messages. */
class MockWebSocket extends EventTarget {
  static readonly tag = "original";
  constructor(public url: string) {
    super();
  }
  receive(data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.dispatchEvent(new MessageEvent("message", { data: payload }));
  }
}

function makeScope(): { WebSocket: typeof MockWebSocket } {
  return { WebSocket: MockWebSocket };
}

describe("installWebSocketHook", () => {
  test("emits the payload of an endData message", () => {
    const scope = makeScope();
    const received: EndData[] = [];
    installWebSocketHook((d) => received.push(d), scope as unknown as typeof globalThis);

    const sock = new scope.WebSocket("wss://socket.lichess.org") as unknown as MockWebSocket;
    sock.receive({ t: "endData", d: { winner: "white", status: { id: 35, name: "outoftime" } } });

    expect(received).toEqual([{ winner: "white", status: { id: 35, name: "outoftime" } }]);
  });

  test("ignores non-endData messages and malformed data without throwing", () => {
    const scope = makeScope();
    const received: EndData[] = [];
    installWebSocketHook((d) => received.push(d), scope as unknown as typeof globalThis);

    const sock = new scope.WebSocket("wss://socket.lichess.org") as unknown as MockWebSocket;
    sock.receive({ t: "move", d: { uci: "e2e4" } });
    sock.receive("not json {");
    sock.receive({ t: "endData" }); // missing d

    expect(received).toEqual([]);
  });

  test("uninstall restores the original WebSocket", () => {
    const scope = makeScope() as unknown as typeof globalThis;
    const uninstall = installWebSocketHook(() => {}, scope);
    expect(scope.WebSocket).not.toBe(MockWebSocket);
    uninstall();
    expect(scope.WebSocket).toBe(MockWebSocket as unknown as typeof WebSocket);
  });
});

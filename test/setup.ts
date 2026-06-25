/** Register a DOM (window/document/HTMLElement/Event/...) on the global scope for tests. */
import { GlobalWindow } from "happy-dom";

const window = new GlobalWindow();

// Mirror the DOM globals tests and modules expect onto the real global scope.
const props = [
  "document",
  "EventTarget",
  "HTMLElement",
  "HTMLInputElement",
  "Event",
  "MessageEvent",
  "KeyboardEvent",
  "CustomEvent",
  "Node",
  "WebSocket",
  "localStorage",
  "MutationObserver",
] as const;

const g = globalThis as Record<string, unknown>;
g.window = window;
for (const prop of props) {
  g[prop] = (window as unknown as Record<string, unknown>)[prop];
}

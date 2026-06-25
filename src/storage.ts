/**
 * Storage adapter.
 *
 * A tiny synchronous key/value interface so the rest of the app never touches a
 * concrete storage API directly. v1 is backed by Tampermonkey's `GM_*` functions,
 * falling back to `localStorage`. A future browser extension swaps in a
 * `chrome.storage`-backed implementation here and nothing else changes.
 */
export interface Storage {
  /** Return the stored string for `key`, or `null` if absent. */
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// Tampermonkey injects these as globals when the matching `@grant`s are present.
declare function GM_getValue(key: string, defaultValue?: string): string | undefined;
declare function GM_setValue(key: string, value: string): void;

/**
 * Build the default storage adapter for the current environment: prefer `GM_*`
 * (userscript), otherwise `localStorage` (extension content script / plain page).
 */
export function createDefaultStorage(): Storage {
  const hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function";
  if (hasGM) {
    return {
      get: (key) => {
        const v = GM_getValue(key);
        return v === undefined ? null : v;
      },
      set: (key, value) => GM_setValue(key, value),
    };
  }
  return {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
  };
}

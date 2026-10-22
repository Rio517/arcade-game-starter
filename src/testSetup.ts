// Node 25 and later ship their own localStorage, which shadows jsdom's and has no methods without a file.
// Tests want jsdom's, as on Node 20.
const jsdom = (globalThis as { jsdom?: { window: Record<string, unknown> } }).jsdom;
if (jsdom) {
  for (const name of ['localStorage', 'sessionStorage', 'Storage']) {
    Object.defineProperty(globalThis, name, { configurable: true, get: () => jsdom.window[name] });
  }
}

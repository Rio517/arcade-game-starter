/**
 * Writes the catalog's English into index.html, so the page paints its words before any script runs.
 * `data-t="game.…"` marks an element whose text is that word and `data-t-label="game.…"` one whose
 * aria-label is. vite.config.ts runs this on the page in dev and in the build. It is strict: a key that is
 * not in the catalog, or a `data-t` it cannot write (single quotes, child markup, a self-closing element),
 * stops the build and names the element. Comments, scripts and styles are left
 * alone.
 */
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SKIPPED = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTRIBUTE = /(?<=[\s"'])data-t(?:-label)?(?![\w-])/gi;

export function firstPaint(html: string, messages: Record<string, string>): string {
  const word = (key: string, element: string): string => {
    if (!Object.prototype.hasOwnProperty.call(messages, key)) throw new Error(`index.html: "${key}" (on ${element}) is not in src/i18n/messages/en.json`);
    return escape(messages[key]);
  };
  const fail = (element: string, why: string): never => {
    throw new Error(`index.html: cannot write the words of ${element.slice(0, 120)}: ${why}`);
  };

  const page = (chunk: string): string => {
    let out = '';
    let at = 0;
    let handled = 0;
    TAG.lastIndex = 0;
    for (let m = TAG.exec(chunk); m; m = TAG.exec(chunk)) {
      const [open, tag, attributes, selfClosing] = m;
      const text = /\sdata-t\s*=\s*"([^"]*)"/.exec(attributes);
      const label = /\sdata-t-label\s*=\s*"([^"]*)"/.exec(attributes);
      if (!text && !label) continue;
      out += chunk.slice(at, m.index);
      let start = open;
      if (label) {
        handled += 1;
        const without = attributes.replace(/\saria-label\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/, '');
        start = `<${tag}${without} aria-label="${word(label[1], open)}"${selfClosing ? ' /' : ''}>`;
      }
      if (!text) {
        out += start;
        at = m.index + open.length;
        continue;
      }
      handled += 1;
      if (selfClosing) fail(open, 'a self-closing element has no text');
      const bodyStart = m.index + open.length;
      const found = chunk.slice(bodyStart).search(new RegExp(`</${tag}[\\s>]`, 'i'));
      const close = found < 0 ? -1 : bodyStart + found;
      if (close < 0) fail(open, `no closing </${tag}>`);
      if (chunk.slice(bodyStart, close).includes('<')) fail(open, 'it has child markup (only plain text)');
      out += start + word(text[1], open);
      at = close;
      TAG.lastIndex = close;
    }
    out += chunk.slice(at);
    const wanted = (chunk.match(ATTRIBUTE) ?? []).length;
    if (handled !== wanted) {
      const left = /<[^<]*\sdata-t(?:-label)?\b[^<]*/.exec(chunk.replace(TAG, (tag) => (/\sdata-t(?:-label)?\s*=\s*"/.test(tag) ? '' : tag)));
      fail(left ? left[0] : 'data-t', 'write data-t="key" with double quotes on a normal tag');
    }
    return out;
  };

  let result = '';
  let at = 0;
  for (const skipped of html.matchAll(SKIPPED)) {
    result += page(html.slice(at, skipped.index)) + skipped[0];
    at = skipped.index! + skipped[0].length;
  }
  return result + page(html.slice(at));
}

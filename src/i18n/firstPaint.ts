/**
 * Writes the catalog's English into index.html, so the page paints its words before any script runs.
 * `data-t="game.…"` marks an element whose text is that word (plain text only) and `data-t-label="game.…"`
 * one whose aria-label is. vite.config.ts runs this on the page in dev and in the build; a key that is not
 * in the catalog stops the build with a message.
 */
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function firstPaint(html: string, messages: Record<string, string>): string {
  const word = (key: string): string => {
    if (!Object.prototype.hasOwnProperty.call(messages, key)) throw new Error(`index.html: "${key}" is not in src/i18n/messages/en.json`);
    return escape(messages[key]);
  };
  return html
    .replace(/(<(\w+)\b[^>]*\sdata-t="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g, (_all, open: string, _tag: string, key: string, close: string) => open + word(key) + close)
    .replace(/<\w+\b[^>]*\sdata-t-label="([^"]+)"[^>]*>/g, (open: string, key: string) =>
      (/\saria-label="[^"]*"/.test(open) ? open.replace(/\saria-label="[^"]*"/, '') : open).replace(/>$/, ` aria-label="${word(key)}">`),
    );
}

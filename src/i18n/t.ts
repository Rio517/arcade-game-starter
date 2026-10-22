import { formatSlots, hasOwn } from '../arcade/words';
import messages from './messages/en.json';

// Every word the game shows lives in messages/en.json, one flat object with dotted keys
// (game.<screen>.<name>: letters and digits in dotted segments). The kit's words are the kit's own
// (src/arcade/words.ts). `t(key, values)` fills `{name}` slots; use no other message syntax (the catalog
// test checks this). Never change or measure what t() returns (no toUpperCase, split, slice, length,
// includes, comparisons or measureText). Use CSS text-transform, or do it on the data.

type Values = Record<string, string | number>;

/** The keys of the game's words, so a misspelt key fails the type check. */
export type GameKey = keyof typeof messages;

const catalog: Record<string, string> = messages;

/** Fill a message's `{name}` slots. */
export const formatMessage = formatSlots;

/** True if the catalog has this key (so a page can keep its own text for a key that is missing). */
export function hasWord(key: string): boolean {
  return hasOwn(catalog, key);
}

/** The game's words. In dev a key that is not in the catalog throws; in production it returns the key. */
export function t(key: GameKey, values?: Values): string {
  if (!hasOwn(catalog, key)) {
    if (import.meta.env.DEV) throw new Error(`Missing message key: ${key}`);
    return key;
  }
  return formatMessage(catalog[key], values);
}

/**
 * The `kit.*` entries of the catalog, to hand to the kit with `arcade.words.use`. A game changes a kit word
 * by adding its `kit.*` key with the new text to messages/en.json.
 */
export const kitOverrides: Record<string, string> = Object.fromEntries(Object.entries(catalog).filter(([key]) => key.startsWith('kit.')));

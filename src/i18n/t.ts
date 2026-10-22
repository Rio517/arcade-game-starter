import { arcade } from '../arcade';
import messages from './messages/en.json';

// Every word the game shows lives in messages/en.json, one flat object with dotted keys
// (game.<screen>.<name>: letters and digits in dotted segments). The kit's words are the kit's own
// (src/arcade/words.ts). `t(key, values)` fills `{name}` slots; messages use no other syntax (a test
// checks this).

type Values = Record<string, string | number>;

/** The keys of the game's words, so a misspelt key fails the type check. */
export type GameKey = keyof typeof messages;

const catalog: Record<string, string> = messages;

/** The game's words. In dev a key that is not in the catalog throws; in production it returns the key. */
export function t(key: GameKey, values?: Values): string {
  if (!arcade.words.hasOwn(catalog, key)) {
    if (import.meta.env.DEV) throw new Error(`Missing message key: ${key}`);
    return key;
  }
  return arcade.words.format(catalog[key], values);
}

/**
 * The `kit.*` entries of the catalog, to hand to the kit with `arcade.words.use`. A game changes a kit word
 * by adding its `kit.*` key with the new text to messages/en.json.
 */
export const kitOverrides: Record<string, string> = Object.fromEntries(Object.entries(catalog).filter(([key]) => key.startsWith('kit.')));

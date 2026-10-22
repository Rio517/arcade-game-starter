/**
 * The words and the code agree. Key format: letters and digits in dotted segments (game.start.here).
 * Game keys are read from `t('…')` calls and from `data-t="…"` / `data-t-label="…"` in index.html; kit keys
 * from `kt('…')` calls in src/arcade. A quoted string that is not an argument of those calls is ignored,
 * so 'game.over' as an event name does not trip this.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { formatSlots, kitWords, kt, resetKitWords, useKitWords } from '../arcade/words';
import messages from './messages/en.json';
import { kitOverrides, t } from './t';

const gameSources = import.meta.glob(['../**/*.ts', '!../i18n/**', '!../arcade/**', '!**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const kitSources = import.meta.glob(['../arcade/*.ts', '!../arcade/words.ts', '!**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const pages = import.meta.glob('/index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const KEY = '[A-Za-z0-9]+(?:\\.[A-Za-z0-9]+)+';
const keysIn = (texts: string[], pattern: RegExp): Set<string> => new Set(texts.flatMap((text) => [...text.matchAll(pattern)].map((m) => m[2])));
const gameUsed = new Set([
  ...keysIn(Object.values(gameSources), new RegExp(`\\bt\\(\\s*(['"])(${KEY})\\1`, 'g')),
  ...keysIn(Object.values(pages), new RegExp(`data-t(?:-label)?=(["'])(${KEY})\\1`, 'g')),
]);
const kitUsed = keysIn(Object.values(kitSources), new RegExp(`\\bkt\\(\\s*(['"])(${KEY})\\1`, 'g'));

const catalogKeys = Object.keys(messages);
const gameKeys = catalogKeys.filter((k) => !k.startsWith('kit.'));
const kitKeys = Object.keys(kitWords);

describe('the page words', () => {
  it('start as the catalog English, so the first paint is the final text', () => {
    const html = Object.values(pages)[0];
    const text = [...html.matchAll(/<(\w+)[^>]*\sdata-t="([^"]+)"[^>]*>([^<]*)<\/\1>/g)];
    expect(text.length).toBeGreaterThan(0);
    for (const [, , key, inner] of text) expect([key, inner]).toEqual([key, (messages as Record<string, string>)[key]]);
    const labels = [...html.matchAll(/<[^>]*\saria-label="([^"]*)"[^>]*\sdata-t-label="([^"]+)"[^>]*>/g)];
    expect(labels.length).toBeGreaterThan(0);
    for (const [, label, key] of labels) expect([key, label]).toEqual([key, (messages as Record<string, string>)[key]]);
  });
});

describe('the game words', () => {
  it('finds the sources it reads', () => {
    expect(Object.keys(gameSources).length).toBeGreaterThan(0);
    expect(Object.keys(pages)).toEqual(['/index.html']);
    expect(gameUsed.size).toBeGreaterThan(0);
  });

  it('are all game.* keys in the key format, and the kit words are kit.* keys', () => {
    expect(gameKeys.filter((k) => !/^game(\.[A-Za-z0-9]+)+$/.test(k))).toEqual([]);
    expect(kitKeys.filter((k) => !/^kit(\.[A-Za-z0-9]+)+$/.test(k))).toEqual([]);
  });

  it('have every key the code asks for, and nothing else', () => {
    expect([...gameUsed].filter((k) => !gameKeys.includes(k)).sort()).toEqual([]);
    expect(gameKeys.filter((k) => !gameUsed.has(k)).sort()).toEqual([]);
  });

  it('may hold kit.* entries only as changes to words the kit has', () => {
    expect(catalogKeys.filter((k) => k.startsWith('kit.') && !Object.hasOwn(kitWords, k))).toEqual([]);
  });

  it('fill their slots', () => {
    expect(t('game.start.playingAs', { name: 'Rio' })).toBe('Playing as Rio');
    expect(t('game.start.playingAsChange', { playing: t('game.start.playingAs', { name: 'Rio' }) })).toBe('Playing as Rio. Change player');
    expect(t('game.start.here', { count: 3 })).toBe('3 people are here.');
  });
});

describe('the kit words', () => {
  it('have every key the kit asks for, and nothing else', () => {
    expect(Object.keys(kitSources).length).toBeGreaterThan(0);
    expect([...kitUsed].filter((k) => !kitKeys.includes(k)).sort()).toEqual([]);
    expect(kitKeys.filter((k) => !kitUsed.has(k)).sort()).toEqual([]);
  });

  it('are the kit English: the game catalog needs none of them', () => {
    expect(kt('kit.connection.joinFailed', { code: 'K7QM' })).toContain("Couldn't join K7QM.");
    expect(kt('kit.together.hintHost', { haveCode: kt('kit.together.haveCode') })).toBe('Friends tap "I have a code" and type this.');
    expect(kitOverrides).toEqual({});
  });

  afterEach(() => resetKitWords());

  it('never throw: an unknown key returns the key', () => {
    expect(kt('kit.nope' as never)).toBe('kit.nope');
    expect(() => kt(undefined as never)).not.toThrow();
  });

  it('change words with use(); calls add up', () => {
    useKitWords({ 'kit.together.leave': 'Go back' });
    useKitWords({ 'kit.together.close': 'Shut' });
    expect(kt('kit.together.leave')).toBe('Go back');
    expect(kt('kit.together.close')).toBe('Shut');
    expect(kt('kit.together.join')).toBe('Join');
    useKitWords({ 'kit.together.room': 'Table {code}' });
    expect(kt('kit.together.room', { code: 'K7QM' })).toBe('Table K7QM');
  });

  it('ignore an unknown key, a value that is not a string and an empty string', () => {
    useKitWords({ 'kit.made.up': 'x', 'kit.together.leave': 5, 'kit.together.close': '' } as never);
    expect(kt('kit.together.leave')).toBe('Leave');
    expect(kt('kit.together.close')).toBe('Close');
  });
});

describe('the {name} formatter', () => {
  const all = [...Object.values(messages), ...Object.values(kitWords)] as string[];

  it('is enough: every message has only plain {name} slots', () => {
    expect(all.filter((m) => /[{}]/.test(m.replace(/\{\w+\}/g, '')))).toEqual([]);
  });

  it('fills slots, leaves an unknown slot and ignores inherited names', () => {
    expect(formatSlots('Hi {name}, {n} left, {nope}', { name: 'Rio', n: 3 })).toBe('Hi Rio, 3 left, {nope}');
    expect(formatSlots('{toString}', {})).toBe('{toString}');
    expect(formatSlots('No slots')).toBe('No slots');
  });
});

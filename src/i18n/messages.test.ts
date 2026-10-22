/**
 * The words and the code agree. Key format: letters and digits in dotted segments (game.start.here).
 * Game keys are read from `t('…')` calls and from `data-t="…"` / `data-t-label="…"` in index.html; kit keys
 * from `kt('…')` calls in src/arcade. A quoted string that is not an argument of those calls is ignored,
 * so 'game.over' as an event name does not trip this.
 */
import { describe, expect, it } from 'vitest';
import { arcade } from '../arcade';
import { firstPaint } from './firstPaint';
import messages from './messages/en.json';
import { t } from './t';

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
const kitKeys = arcade.words.keys();

describe('the page words', () => {
  it('are written into index.html from the catalog', () => {
    const doc = new DOMParser().parseFromString(firstPaint(Object.values(pages)[0], messages), 'text/html');
    const texts = [...doc.querySelectorAll('[data-t]')];
    const labels = [...doc.querySelectorAll('[data-t-label]')];
    expect(texts.length).toBeGreaterThan(0);
    expect(labels.length).toBeGreaterThan(0);
    for (const node of texts) expect([node.getAttribute('data-t'), node.textContent]).toEqual([node.getAttribute('data-t'), (messages as Record<string, string>)[node.getAttribute('data-t')!]]);
    for (const node of labels) expect(node.getAttribute('aria-label')).toBe((messages as Record<string, string>)[node.getAttribute('data-t-label')!]);
  });

  it('stop the build on a key the catalog lacks', () => {
    expect(() => firstPaint('<p data-t="game.nope.x"></p>', messages)).toThrow(/game\.nope\.x/);
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

  it('have every key the code asks for (an unused word is harmless)', () => {
    expect([...gameUsed].filter((k) => !gameKeys.includes(k)).sort()).toEqual([]);
  });

  it('may hold kit.* entries only as changes to words the kit has', () => {
    expect(catalogKeys.filter((k) => k.startsWith('kit.') && !kitKeys.includes(k))).toEqual([]);
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
});

describe('the {name} slots', () => {
  it('are all a message uses: no other braces', () => {
    expect((Object.values(messages) as string[]).filter((m) => /[{}]/.test(m.replace(/\{\w+\}/g, '')))).toEqual([]);
  });
});

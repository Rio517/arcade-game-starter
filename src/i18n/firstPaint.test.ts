import { describe, expect, it } from 'vitest';
import { firstPaint } from './firstPaint';

const words = { 'game.a': 'Hello & <you>', 'game.b': 'Label' };
const bad = (html: string) => expect(() => firstPaint(html, words));

describe('firstPaint', () => {
  it('writes text and labels, escaped', () => {
    expect(firstPaint('<p data-t="game.a"></p><button data-t-label="game.b" aria-label="old">x</button>', words)).toBe(
      '<p data-t="game.a">Hello &amp; &lt;you&gt;</p><button data-t-label="game.b" aria-label="Label">x</button>',
    );
  });

  it('handles a self-closing element with a label', () => {
    expect(firstPaint('<img src="a.png" data-t-label="game.b" />', words)).toBe('<img src="a.png" data-t-label="game.b" aria-label="Label" />');
    expect(firstPaint('<img data-t-label="game.b">', words)).toBe('<img data-t-label="game.b" aria-label="Label">');
  });

  it('leaves comments, scripts and styles alone', () => {
    const html = '<!-- <p data-t="game.zzz"> --><script>const s = \'data-t="game.zzz"\';</script><style>/* data-t */</style><p data-t="game.b"></p>';
    expect(firstPaint(html, words)).toContain('<p data-t="game.b">Label</p>');
  });

  it('stops on what it cannot write, naming the element', () => {
    bad('<p data-t="game.nope"></p>').toThrow(/game\.nope/);
    bad('<p data-t="game.a"><b>x</b></p>').toThrow(/child markup/);
    bad("<p data-t='game.a'></p>").toThrow(/data-t/);
    bad('<br data-t="game.a" />').toThrow(/self-closing/);
    bad('<p data-t="game.a">no end').toThrow(/closing/);
  });

  it('finds the closing tag after letters that change length in lower case', () => {
    expect(firstPaint('<title>İİstanbul</title><p data-t="game.b"></p>', words)).toContain('<p data-t="game.b">Label</p>');
  });

  it('leaves other data-t-* attributes and data-t in text alone', () => {
    expect(firstPaint('<img alt="data-t" data-t-label="game.b">', words)).toContain('aria-label="Label"');
    expect(firstPaint('<p data-t-note="x" data-t="game.b"></p>', words)).toContain('>Label</p>');
  });
});

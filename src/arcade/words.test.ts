import { afterEach, describe, expect, it } from 'vitest';
import { formatSlots, kitWords, kt, resetKitWords, useKitWords } from './words';

afterEach(() => resetKitWords());

describe('the kit words', () => {
  it('are English with {name} slots', () => {
    expect(kt('kit.connection.joinFailed', { code: 'K7QM' })).toContain("Couldn't join K7QM.");
    expect(kt('kit.together.hintHost', { haveCode: kt('kit.together.haveCode') })).toBe('Friends tap "I have a code" and type this.');
  });

  it('have keys in the key format and only plain slots', () => {
    expect(Object.keys(kitWords).filter((k) => !/^kit(\.[A-Za-z0-9]+)+$/.test(k))).toEqual([]);
    expect(Object.values(kitWords).filter((m) => /[{}]/.test(m.replace(/\{\w+\}/g, '')))).toEqual([]);
  });

  it('never throw: an unknown key returns the key', () => {
    expect(kt('kit.nope' as never)).toBe('kit.nope');
    expect(() => kt(undefined as never)).not.toThrow();
  });

  it('change with use(); calls add up', () => {
    useKitWords({ 'kit.together.leave': 'Go back' });
    useKitWords({ 'kit.together.close': 'Shut' });
    expect(kt('kit.together.leave')).toBe('Go back');
    expect(kt('kit.together.close')).toBe('Shut');
    expect(kt('kit.together.join')).toBe('Join');
    useKitWords({ 'kit.together.room': 'Table {code}' });
    expect(kt('kit.together.room', { code: 'K7QM' })).toBe('Table K7QM');
  });

  it('ignore an unknown key, a value that is not a string and an empty string; use() takes nothing', () => {
    useKitWords({ 'kit.made.up': 'x', 'kit.together.leave': 5, 'kit.together.close': '' } as never);
    expect(kt('kit.together.leave')).toBe('Leave');
    expect(kt('kit.together.close')).toBe('Close');
    expect(() => useKitWords(undefined as never)).not.toThrow();
    expect(() => useKitWords(null as never)).not.toThrow();
  });
});

describe('the {name} formatter', () => {
  it('fills slots, leaves an unknown slot and ignores inherited names', () => {
    expect(formatSlots('Hi {name}, {n} left, {nope}', { name: 'Rio', n: 3 })).toBe('Hi Rio, 3 left, {nope}');
    expect(formatSlots('{toString}', {})).toBe('{toString}');
    expect(formatSlots('No slots')).toBe('No slots');
  });
});

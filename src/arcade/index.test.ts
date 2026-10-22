import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRIP_KEY } from './arcadePlayer';
import { BACK_KEY, encodeHandoff } from './handoff';

/** The entry point reads the handoff when it is imported, so each case sets the page up first and imports it fresh. */
async function openedWith(back: string) {
  window.history.replaceState(null, '', '/#arcade=' + encodeHandoff({ name: 'Klara', colour: '#e0405f', back }));
  vi.resetModules();
  return (await import('./index')).arcade;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('the entry point after a handoff', () => {
  it('sets the player, remembers back, and forgets the trip to the player screen', async () => {
    window.sessionStorage.setItem(TRIP_KEY, String(Date.now()));
    const arcade = await openedWith('http://localhost:5189/');
    expect(arcade.player()).toEqual({ name: 'Klara', colour: '#e0405f' });
    expect(window.sessionStorage.getItem(BACK_KEY)).toBe('http://localhost:5189/');
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBeNull();
  });

  it('forgets the trip even when remembering back fails (private mode)', async () => {
    window.sessionStorage.setItem(TRIP_KEY, String(Date.now()));
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === BACK_KEY) throw new Error('private mode');
      return real.call(this, k, v);
    });
    const arcade = await openedWith('http://localhost:5189/');
    expect(arcade.player()?.name).toBe('Klara');
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBeNull();
  });

  it('keeps the trip when the handoff is refused', async () => {
    window.sessionStorage.setItem(TRIP_KEY, String(Date.now()));
    await openedWith('http://example.com/'); // http, and not a dev host
    expect(window.sessionStorage.getItem(TRIP_KEY)).not.toBeNull();
  });
});

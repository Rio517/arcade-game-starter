import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArcadePlayer, ARCADE_PLAYER_KEY, ARCADE_USERS_KEY } from './arcadePlayer';
import { createStore } from './storage';
import { createUi } from './ui';

function setup(pathname = '/offroad/', gameId = 'offroad', now = () => 1_000_000, hostname = 'localhost') {
  const replace = vi.fn();
  const location = { hostname, pathname, search: '', replace };
  const ap = createArcadePlayer({ gameId, local: window.localStorage, session: window.sessionStorage, now, location });
  return { ap, replace, location };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('the arcade player contract', () => {
  it('reads the key the arcade writes', () => {
    window.localStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify({ name: 'Robin', colour: '#34E0C8' }));
    expect(setup().ap.player()).toEqual({ name: 'Robin', colour: '#34e0c8' });
  });

  it('has no player without a key, and survives a corrupt one', () => {
    expect(setup().ap.player()).toBeNull();
    for (const bad of ['{nope', 'null', '"x"', '{"name":"","colour":"#34e0c8"}', '{"name":"A","colour":"teal"}', '{"name":"' + 'A'.repeat(21) + '","colour":"#34e0c8"}']) {
      window.localStorage.setItem(ARCADE_PLAYER_KEY, bad);
      expect(setup().ap.player(), bad).toBeNull();
    }
  });

  it('knows it is on the arcade by the key, or by the path plus the arcade’s players', () => {
    expect(setup().ap.onArcade()).toBe(false); // a family’s own copy: nothing from the arcade
    window.localStorage.setItem(ARCADE_USERS_KEY, '{}');
    expect(setup('/offroad/').ap.onArcade()).toBe(true);
    expect(setup('/offroad').ap.onArcade()).toBe(true);
    expect(setup('/my-game/', 'my-game').ap.onArcade()).toBe(true);
    expect(setup('/somewhere/else/').ap.onArcade()).toBe(false);
    window.localStorage.clear();
    window.localStorage.setItem(ARCADE_PLAYER_KEY, '{corrupt');
    expect(setup('/somewhere/else/').ap.onArcade()).toBe(true);
  });

  it('knows familyarcade.eu is the arcade before the browser has any arcade data', () => {
    expect(setup('/offroad/', 'offroad', () => 1_000_000, 'familyarcade.eu').ap.onArcade()).toBe(true);
    expect(setup('/elsewhere/', 'offroad', () => 1_000_000, 'familyarcade.eu').ap.onArcade()).toBe(false);
    expect(setup('/offroad/', 'offroad', () => 1_000_000, 'someone.github.io').ap.onArcade()).toBe(false);
  });

  it('opens the arcade’s player screen with this page as the way back', () => {
    const { ap, replace, location } = setup();
    location.search = '?tracks=1';
    ap.openPlayerScreen();
    expect(replace).toHaveBeenCalledWith('/#/player?back=%2Foffroad%2F%3Ftracks%3D1');
  });

  it('does not go round again when the screen came back with no player', () => {
    window.localStorage.setItem(ARCADE_USERS_KEY, '{}');
    let t = 1_000_000;
    const { ap } = setup('/offroad/', 'offroad', () => t);
    expect(ap.onArcade()).toBe(true);
    ap.openPlayerScreen();
    t += 3_000;
    expect(ap.onArcade()).toBe(false);
    t += 20_000;
    expect(ap.onArcade()).toBe(true);
  });
});

describe('the kit on the arcade’s origin', () => {
  it('uses the arcade’s player over its own, and saves under that name', () => {
    const { ap } = setup();
    const store = createStore({ gameId: 'offroad', local: window.localStorage, session: null, arcadePlayer: ap.player });
    store.setPlayer({ name: 'Player', colour: '#e0405f' });
    store.save('best', 1);
    window.localStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify({ name: 'Robin', colour: '#34e0c8' }));
    expect(store.player()).toEqual({ name: 'Robin', colour: '#34e0c8' });
    expect(store.load('best')).toBeUndefined();
    store.save('best', 7);
    expect(window.localStorage.getItem('arcade-kit:offroad:Robin:best')).toBe('7');
    window.localStorage.removeItem(ARCADE_PLAYER_KEY); // signed out of the arcade: its own again
    expect(store.player()).toEqual({ name: 'Player', colour: '#e0405f' });
    expect(store.load('best')).toBe(1);
  });

  it('ensurePlayer goes to the arcade’s screen when nobody is chosen, and resolves when somebody is', async () => {
    const { ap, replace } = setup();
    window.localStorage.setItem(ARCADE_USERS_KEY, '{}');
    const store = createStore({ gameId: 'offroad', local: window.localStorage, session: null, arcadePlayer: ap.player });
    const ui = createUi({ getPlayer: store.player, setPlayer: store.setPlayer, together: {} as never, arcade: ap });
    void ui.ensurePlayer(document.body);
    expect(replace).toHaveBeenCalledTimes(1);
    window.sessionStorage.clear();
    void ui.playerPicker(document.body); // Switch player
    expect(replace).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.ak-overlay, [role=dialog]')).toBeNull();
    window.localStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify({ name: 'Robin', colour: '#34e0c8' }));
    await expect(ui.ensurePlayer(document.body)).resolves.toEqual({ name: 'Robin', colour: '#34e0c8' });
  });

  it('off the arcade, the kit’s own form still opens', () => {
    const { ap, replace } = setup('/star-catch/', 'star-catch');
    const store = createStore({ gameId: 'star-catch', local: window.localStorage, session: null, arcadePlayer: ap.player });
    const ui = createUi({ getPlayer: store.player, setPlayer: store.setPlayer, together: {} as never, arcade: ap });
    void ui.ensurePlayer(document.body);
    expect(replace).not.toHaveBeenCalled();
    expect(document.body.querySelector('input.ak-name')).not.toBeNull();
  });
});

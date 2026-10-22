import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArcadePlayer, isDevHost, ARCADE_PLAYER_KEY, ARCADE_USERS_KEY, TRIP_KEY } from './arcadePlayer';
import { consumeHandoff, encodeHandoff } from './handoff';
import { createStore } from './storage';
import { createUi, type PlayerUi } from './ui';

/** Every UI a test makes, disposed after it (each keeps a window listener). */
const made: PlayerUi[] = [];
function makeUi(deps: Parameters<typeof createUi>[0]): PlayerUi {
  const ui = createUi(deps);
  made.push(ui);
  return ui;
}

function setup(pathname = '/offroad/', gameId = 'offroad', now = () => 1_000_000, hostname = 'localhost') {
  const replace = vi.fn();
  const location = { hostname, pathname, search: '', replace };
  const ap = createArcadePlayer({ gameId, local: window.localStorage, session: window.sessionStorage, now, location });
  return { ap, replace, location };
}

const dev = { port: 5189 };

/** A page on the live arcade (familyarcade.eu/offroad/) or on a dev server, with its own clock and its own arcade dev server that is up or down. */
function page(opts: { live?: boolean; up?: boolean; session?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null; probe?: (origin: string, signal: AbortSignal) => Promise<boolean> } = {}) {
  const t = { v: 1_000_000 };
  const net = { up: opts.up ?? true };
  const replace = vi.fn();
  const hostname = opts.live ? 'familyarcade.eu' : 'localhost';
  const location = { hostname, href: `http://${hostname}:4418/offroad/`, origin: `http://${hostname}:4418`, pathname: '/offroad/', search: '', replace };
  const probe = vi.fn(opts.probe ?? (async () => net.up));
  const session = opts.session === undefined ? window.sessionStorage : opts.session;
  const ap = createArcadePlayer({ gameId: 'offroad', local: window.localStorage, session, now: () => t.v, location, dev: opts.live ? null : dev, probe });
  const ui = makeUi({ getPlayer: () => null, setPlayer: () => {}, together: {} as never, arcade: ap });
  return { t, net, replace, probe, ap, ui };
}

const overlays = () => document.body.querySelectorAll('.ak-overlay').length;
const pickName = (name: string) => {
  (document.body.querySelector('input.ak-name') as HTMLInputElement).value = name;
  (document.body.querySelector('.ak-primary') as HTMLElement).click();
};
const tick = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  for (const ui of made.splice(0)) ui.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  // a form's keydown listener drops itself once its card is off the page: one key, and no test leaves one behind
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
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

  it('a player read from the arcade keeps the stamp while this page’s own trip is on its way, and drops it once the window is over', () => {
    const { ap, t } = page({ live: true });
    ap.openPlayerScreen();
    window.localStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify({ name: 'Robin', colour: '#34e0c8' }));
    t.v += 1_000;
    expect(ap.player()?.name).toBe('Robin');
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBe('1000000');
    expect(ap.tripPending()).toBe(true);
    t.v += 15_000;
    expect(ap.player()?.name).toBe('Robin');
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBeNull();
    expect(ap.tripPending()).toBe(false);
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
    const ui = makeUi({ getPlayer: store.player, setPlayer: store.setPlayer, together: {} as never, arcade: ap });
    void ui.ensurePlayer(document.body);
    expect(replace).toHaveBeenCalledTimes(1);
    void ui.playerPicker(document.body); // Switch player, while the trip is on its way: ignored
    expect(replace).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ak-overlay, [role=dialog]')).toBeNull();
    window.localStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify({ name: 'Robin', colour: '#34e0c8' }));
    await expect(ui.ensurePlayer(document.body)).resolves.toEqual({ name: 'Robin', colour: '#34e0c8' });
  });

  it('off the arcade, the kit’s own form still opens', () => {
    const { ap, replace } = setup('/star-catch/', 'star-catch');
    const store = createStore({ gameId: 'star-catch', local: window.localStorage, session: null, arcadePlayer: ap.player });
    const ui = makeUi({ getPlayer: store.player, setPlayer: store.setPlayer, together: {} as never, arcade: ap });
    void ui.ensurePlayer(document.body);
    expect(replace).not.toHaveBeenCalled();
    expect(document.body.querySelector('input.ak-name')).not.toBeNull();
  });

  describe('on a dev server', () => {
    function devSetup(hostname: string, reachable: boolean, devArg: typeof dev | null = dev) {
      const replace = vi.fn();
      const location = { hostname, href: `http://${hostname}:4418/?x=1#frag`, origin: `http://${hostname}:4418`, pathname: '/', search: '?x=1', replace };
      const probe = vi.fn(async () => reachable);
      const ap = createArcadePlayer({ gameId: 'offroad', local: window.localStorage, session: window.sessionStorage, location, dev: devArg, probe });
      const store = createStore({ gameId: 'offroad', local: window.localStorage, session: null, arcadePlayer: ap.player });
      const ui = makeUi({ getPlayer: store.player, setPlayer: store.setPlayer, together: {} as never, arcade: ap });
      return { ap, replace, probe, ui };
    }

    it.each(['localhost', '127.0.0.1', '100.76.56.13', '192.168.1.20'])('goes to the arcade’s dev server from %s, with the full page as the way back', async (host) => {
      const { ui, replace, probe } = devSetup(host, true);
      void ui.ensurePlayer(document.body);
      await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
      expect(probe).toHaveBeenCalledWith(`http://${host}:5189`, expect.any(AbortSignal));
      expect(replace).toHaveBeenCalledWith(`http://${host}:5189/#/player?back=${encodeURIComponent(`http://${host}:4418/?x=1`)}&game=offroad`);
    });

    it('uses VITE_ARCADE_ORIGIN when one is given', async () => {
      const { ui, replace } = devSetup('localhost', true, { origin: 'http://localhost:6000', port: 5189 } as never);
      void ui.ensurePlayer(document.body);
      await vi.waitFor(() => expect(replace).toHaveBeenCalled());
      expect(String(replace.mock.calls[0][0])).toMatch(/^http:\/\/localhost:6000\/#\/player/);
    });

    it('shows today’s form when the arcade’s dev server does not answer', async () => {
      const { ui, replace } = devSetup('localhost', false);
      void ui.ensurePlayer(document.body);
      await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
      expect(replace).not.toHaveBeenCalled();
    });

    it('shows the form straight away for a build (no dev option) and for a host that is not a dev host', () => {
      for (const [host, devArg] of [['localhost', null], ['example.com', dev]] as const) {
        document.body.innerHTML = '';
        const { ui, replace, probe } = devSetup(host, true, devArg);
        void ui.ensurePlayer(document.body);
        expect(document.body.querySelector('input.ak-name')).not.toBeNull();
        expect(probe).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
      }
    });

    it('takes the origin the probe returned, strips trailing slashes, and keeps the page’s port in the way back', async () => {
      const { ui, replace, probe } = devSetup('localhost', true, { origin: 'http://localhost:6000///', port: 5189 } as never);
      void ui.playerPicker(document.body);
      await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
      expect(probe).toHaveBeenCalledWith('http://localhost:6000', expect.any(AbortSignal));
      expect(replace).toHaveBeenCalledWith(`http://localhost:6000/#/player?back=${encodeURIComponent('http://localhost:4418/?x=1')}&game=offroad`);
    });

    it('the picker opens again after the form is answered', async () => {
      const { ui, probe } = devSetup('localhost', false);
      const first = ui.playerPicker(document.body);
      await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
      pickName('Robin');
      await first;
      void ui.playerPicker(document.body);
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    });

    it('a trip stamped before this page loaded does not block Who, and the empty-handed guard shows the form', async () => {
      window.sessionStorage.setItem(TRIP_KEY, '999000');
      const { ui, replace } = page();
      void ui.playerPicker(document.body);
      await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
      expect(replace).not.toHaveBeenCalled();
    });

    it('a return with a player leaves the trip until the entry point forgets it, then devArcade probes again', async () => {
      const { ap, t } = page();
      ap.openPlayerScreen('http://localhost:5189');
      t.v += 2000;
      expect(ap.devArcade()).toBeNull(); // back with nothing: no second trip
      const win = {
        location: { hash: '#arcade=' + encodeHandoff({ name: 'Klara', colour: '#e0405f', back: 'http://localhost:5189/' }), pathname: '/', search: '' },
        history: { state: null, replaceState() {} },
      };
      expect(consumeHandoff(win, window.sessionStorage, { dev: true })).not.toBeNull();
      expect(ap.devArcade()).toBeNull(); // consuming the handoff alone leaves the trip: the entry point forgets it
      ap.forgetTrip();
      await expect(ap.devArcade()).resolves.toBe('http://localhost:5189');
    });

    it('a probe that hangs is a no after 1.5 s: the form opens, and Who was not dead meanwhile', async () => {
      vi.useFakeTimers();
      const { ui, replace, probe } = page({ probe: () => new Promise<boolean>(() => {}) });
      const a = ui.playerPicker(document.body);
      await vi.advanceTimersByTimeAsync(1_400);
      expect(overlays()).toBe(0);
      expect(ui.playerPicker(document.body)).toBe(a); // joins the one probe
      await vi.advanceTimersByTimeAsync(200);
      expect(overlays()).toBe(1);
      expect(probe).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();
      pickName('Robin');
      await expect(a).resolves.toMatchObject({ name: 'Robin' });
    });

    it('the probe’s signal is aborted when it runs out of time, and a probe that ignores it is dropped all the same', async () => {
      vi.useFakeTimers();
      let seen: AbortSignal | null = null;
      const { ap } = page({
        probe: (_origin, signal) => {
          seen = signal;
          return new Promise<boolean>(() => {});
        },
      });
      const answer = ap.devArcade();
      await vi.advanceTimersByTimeAsync(0); // the probe is called off the stack
      expect(seen!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(seen!.aborted).toBe(true);
      await expect(answer).resolves.toBeNull();
    });

    it('a navigation that throws on the dev path gives one form, and nothing is left to reject', async () => {
      const { ui, replace } = page({ up: true });
      replace.mockImplementation(() => {
        throw new Error('navigation blocked');
      });
      const pick = ui.playerPicker(document.body);
      await vi.waitFor(() => expect(overlays()).toBe(1));
      expect(replace).toHaveBeenCalledTimes(1);
      await tick();
      expect(overlays()).toBe(1);
      pickName('Robin');
      await expect(pick).resolves.toMatchObject({ name: 'Robin' });
    });

    it('a form that cannot be built gives no second overlay, ends the pick with null, and Who works next time', async () => {
      const { ui } = page({ up: false });
      const removed = vi.spyOn(document, 'removeEventListener');
      const broken = document.createElement('div');
      broken.append = () => {
        throw new Error('no room');
      };
      const pick = ui.playerPicker(broken);
      await expect(pick).resolves.toBeNull();
      expect(overlays()).toBe(0);
      expect(removed.mock.calls.filter(([type]) => type === 'keydown').length).toBe(1);
      void ui.playerPicker(document.body);
      await vi.waitFor(() => expect(overlays()).toBe(1));
    });

    it('a custom arcade whose probe never settles gives the form once the kit’s own expiry is over', async () => {
      vi.useFakeTimers();
      const { ap } = page();
      const ui = makeUi({ getPlayer: () => null, setPlayer: () => {}, together: {} as never, arcade: { ...ap, devArcade: () => new Promise<string | null>(() => {}) } });
      const pick = ui.playerPicker(document.body);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(overlays()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(overlays()).toBe(1);
      pickName('Robin');
      await expect(pick).resolves.toMatchObject({ name: 'Robin' });
    });

    it('a probe that throws, and an arcade that throws before any step, both end in the form', async () => {
      const thrown = page({
        probe: () => {
          throw new Error('no fetch here');
        },
      });
      void thrown.ui.playerPicker(document.body);
      await vi.waitFor(() => expect(overlays()).toBe(1));
      expect(thrown.replace).not.toHaveBeenCalled();
      document.body.innerHTML = '';
      const { ap } = page({ live: true });
      const broken = makeUi({
        getPlayer: () => null,
        setPlayer: () => {},
        together: {} as never,
        arcade: {
          ...ap,
          onArcade: () => {
            throw new Error('storage gone');
          },
        },
      });
      void broken.playerPicker(document.body);
      expect(overlays()).toBe(1);
    });

    it('warns once, in dev, about a VITE_ARCADE_ORIGIN that is not an origin', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { ap } = devSetup('localhost', true, { origin: 'localhost:5189', port: 5189 } as never);
      expect(ap.devArcade()).toBeNull();
      expect(ap.devArcade()).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('localhost:5189');
    });
  });
});

/** Tapping Who always does one sensible thing (one form, or one trip to the arcade) and never goes dead. */
describe('Who, one sensible thing per tap', () => {
  it('live arcade host, tap Who: the trip is stamped and the page navigates once', () => {
    const { ui, ap, replace } = page({ live: true });
    void ui.playerPicker(document.body);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/#/player?back=%2Foffroad%2F');
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBe('1000000');
    expect(ap.tripPending()).toBe(true);
    expect(overlays()).toBe(0);
  });

  it('live, tap again within 15 s with the page still alive: no second navigation, and the same promise, not a dead one', () => {
    const { ui, t, replace } = page({ live: true });
    const a = ui.playerPicker(document.body);
    t.v += 3_000;
    const b = ui.playerPicker(document.body);
    t.v += 11_000;
    const c = ui.ensurePlayer(document.body);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(overlays()).toBe(0);
  });

  it('live, the trip did not unload (blocked): a tap 20 s later navigates again', () => {
    const { ui, t, replace } = page({ live: true });
    void ui.playerPicker(document.body);
    t.v += 20_000;
    void ui.playerPicker(document.body);
    expect(replace).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBe('1020000');
    // and the new trip guards again
    t.v += 3_000;
    void ui.playerPicker(document.body);
    expect(replace).toHaveBeenCalledTimes(2);
  });

  it('dev, arcade up, a double tap during the probe: one probe, one navigation', async () => {
    const { ui, replace, probe } = page({ up: true });
    const a = ui.playerPicker(document.body);
    const b = ui.playerPicker(document.body);
    expect(b).toBe(a);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    await tick();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(overlays()).toBe(0);
  });

  it('dev, arcade down, two concurrent ensurePlayer: one form, and both resolve to the pick', async () => {
    const { ui, replace, probe } = page({ up: false });
    const a = ui.ensurePlayer(document.body);
    const b = ui.ensurePlayer(document.body);
    await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
    expect(overlays()).toBe(1);
    void ui.playerPicker(document.body); // a third, with the form open
    expect(overlays()).toBe(1);
    pickName('Robin');
    await expect(a).resolves.toMatchObject({ name: 'Robin' });
    await expect(b).resolves.toMatchObject({ name: 'Robin' });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(overlays()).toBe(0);
  });

  it('form open in container A, Who from container B: still one overlay and one keydown listener', async () => {
    const { ui } = page({ up: false });
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const added = vi.spyOn(document, 'addEventListener');
    const a = ui.playerPicker(document.getElementById('a')!);
    await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
    const b = ui.playerPicker(document.getElementById('b')!);
    expect(b).toBe(a);
    expect(overlays()).toBe(1);
    expect(document.getElementById('a')!.querySelector('.ak-overlay')).not.toBeNull();
    expect(added.mock.calls.filter(([type]) => type === 'keydown').length).toBe(1);
  });

  it('the form’s overlay was removed without a pick (a re-render): the next Who opens a fresh form, the old listener is gone, and the old promise gets the new pick', async () => {
    const { ui } = page({ up: false });
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const keydowns = (spy: typeof added) => spy.mock.calls.filter(([type]) => type === 'keydown').length;
    const first = ui.playerPicker(document.body);
    await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
    document.body.innerHTML = ''; // the page re-rendered over the card
    expect(keydowns(removed)).toBe(0);
    const second = ui.playerPicker(document.body);
    expect(second).not.toBe(first);
    await vi.waitFor(() => expect(overlays()).toBe(1));
    expect(keydowns(added)).toBe(2);
    expect(keydowns(removed)).toBe(1);
    pickName('Robin');
    await expect(second).resolves.toMatchObject({ name: 'Robin' });
    await expect(first).resolves.toMatchObject({ name: 'Robin' });
    expect(keydowns(removed)).toBe(2);
  });

  it('no session storage (private mode): two taps give one navigation', () => {
    const { ui, replace, t } = page({ live: true, session: null });
    void ui.playerPicker(document.body);
    t.v += 2_000;
    void ui.playerPicker(document.body);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('back from the arcade with a handoff: Who right away opens the picker (the trip is forgotten, in memory too)', () => {
    const { ui, ap, replace, t } = page({ live: true });
    void ui.playerPicker(document.body);
    t.v += 2_000;
    ap.forgetTrip(); // what the entry point does on a handoff
    expect(window.sessionStorage.getItem(TRIP_KEY)).toBeNull();
    expect(ap.tripPending()).toBe(false);
    void ui.playerPicker(document.body);
    expect(replace).toHaveBeenCalledTimes(2);
  });

  describe('a swipe back from the arcade restores the page from the bfcache with the trip still on its way', () => {
    const restore = () => {
      const pageshow = new Event('pageshow') as Event & { persisted: boolean };
      pageshow.persisted = true;
      window.dispatchEvent(pageshow);
    };

    it('live: the trip is forgotten in both stores, and the next Who is a new trip at once', () => {
      const { ui, ap, replace, t } = page({ live: true });
      void ui.playerPicker(document.body);
      t.v += 3_000;
      restore();
      expect(ap.tripPending()).toBe(false);
      expect(window.sessionStorage.getItem(TRIP_KEY)).toBeNull();
      void ui.playerPicker(document.body);
      expect(replace).toHaveBeenCalledTimes(2);
      expect(overlays()).toBe(0);
    });

    it('live: a player picked meanwhile answers the pending ensurePlayer on the restore', async () => {
      const { ap, replace } = page({ live: true });
      const store = createStore({ gameId: 'offroad', local: window.localStorage, session: null, arcadePlayer: ap.player });
      const ui = makeUi({ getPlayer: store.player, setPlayer: store.setPlayer, together: {} as never, arcade: ap });
      const start = ui.ensurePlayer(document.body);
      expect(replace).toHaveBeenCalledTimes(1);
      window.localStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify({ name: 'Robin', colour: '#34e0c8' }));
      restore();
      await expect(start).resolves.toEqual({ name: 'Robin', colour: '#34e0c8' });
      void ui.playerPicker(document.body); // Switch player afterwards: a fresh trip
      expect(replace).toHaveBeenCalledTimes(2);
    });

    it('dev: the next Who is the form when the arcade has gone, and its pick answers the pending ensurePlayer', async () => {
      const { ui, net, replace, t } = page({ up: true });
      const start = ui.ensurePlayer(document.body);
      await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
      t.v += 3_000;
      net.up = false;
      restore();
      void ui.playerPicker(document.body);
      await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
      pickName('Robin');
      await expect(start).resolves.toMatchObject({ name: 'Robin' });
      expect(replace).toHaveBeenCalledTimes(1);
    });
  });

  // Every pick that is not a trip settles with the player picked. A trip's promise is meant to end with the page: the
  // arcade's screen brings the child back to a fresh load. When the page stays (a blocked navigation) or comes back
  // (a swipe back), the trip's promise settles with the next pick's answer instead, so nothing awaits it for ever.
  it('a form pick settles on the pick, by button and by Enter, and on Escape with a player already there', async () => {
    const { ui } = page({ live: false, up: false });
    const byButton = ui.playerPicker(document.body);
    await vi.waitFor(() => expect(overlays()).toBe(1));
    pickName('Robin');
    await expect(byButton).resolves.toMatchObject({ name: 'Robin' });
    const byEnter = ui.playerPicker(document.body);
    await vi.waitFor(() => expect(overlays()).toBe(1));
    const input = document.body.querySelector('input.ak-name') as HTMLInputElement;
    input.value = 'Klara';
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await expect(byEnter).resolves.toMatchObject({ name: 'Klara' });
    const { ap } = page({ live: false, up: false });
    const withPlayer = makeUi({ getPlayer: () => ({ name: 'Robin', colour: '#e0405f' }), setPlayer: () => {}, together: {} as never, arcade: ap });
    const byEscape = withPlayer.playerPicker(document.body);
    await vi.waitFor(() => expect(overlays()).toBe(1));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(byEscape).resolves.toEqual({ name: 'Robin', colour: '#e0405f' });
    expect(overlays()).toBe(0);
  });

  it('ui.ts makes no promise that cannot settle: a raw-source check beside the behaviour above', () => {
    const neverSettles = /new Promise(<[^>]*>)?\s*\(\s*(function\s*)?\([^)]*\)\s*(=>)?\s*\{\s*\}\s*\)/;
    expect(neverSettles.test('new Promise<Player>(() => {})')).toBe(true);
    expect(neverSettles.test('new Promise(function (resolve) { })')).toBe(true);
    const src = Object.values(import.meta.glob('./ui.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
    expect(src).not.toMatch(neverSettles);
  });

  it('a trip that never left the page is answered by the next pick, 20 s on, when the arcade has gone and the form is picked', async () => {
    const { ui, net, replace, t } = page({ up: true });
    const first = ui.playerPicker(document.body);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    t.v += 20_000; // the page never left; the arcade's dev server has gone down since
    net.up = false;
    const second = ui.playerPicker(document.body);
    await vi.waitFor(() => expect(document.body.querySelector('input.ak-name')).not.toBeNull());
    pickName('Robin');
    await expect(second).resolves.toMatchObject({ name: 'Robin' });
    await expect(first).resolves.toMatchObject({ name: 'Robin' });
  });
});

describe('one host rule', () => {
  it.each(['localhost', '127.0.0.1', '[::1]', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '100.64.0.1', '100.127.255.255', 'mac.local', 'box.tail1234.ts.net'])('%s is a dev host', (h) => {
    expect(isDevHost(h)).toBe(true);
  });
  it.each(['100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0', '192.169.0.1', '11.0.0.1', '192.168.1.300', 'example.com', 'familyarcade.eu', 'evil.ts.net.example.com', 'local', 'notlocal.com'])('%s is not', (h) => {
    expect(isDevHost(h)).toBe(false);
  });
  it('counts the host of the arcade origin that was set, and only that one', () => {
    expect(isDevHost('arcade.test', 'http://arcade.test:5189')).toBe(true);
    expect(isDevHost('other.test', 'http://arcade.test:5189')).toBe(false);
    expect(isDevHost('arcade.test', '')).toBe(false);
  });
});

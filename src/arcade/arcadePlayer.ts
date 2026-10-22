/**
 * The family arcade's own player, for a game served on the arcade's origin
 * (familyarcade.eu/offroad/, familyarcade.eu/coin-corner/).
 *
 * The arcade writes who is playing to one small key whenever it changes:
 *
 *   arcade.current-player.v1 = {"name": "Robin", "colour": "#34e0c8"}
 *
 * A child who already chose their player there never sees a player form here.
 * When a game needs a player (nobody chosen, or "switch player"), it opens the
 * arcade's own player screen, `/#/player?back=<this page>`, which returns to
 * this page when the child has picked or made one. Off the arcade's origin
 * (a family's own copy on github.io) none of this applies: the kit's own form.
 */

import { cleanPlayer, type Player } from './player';

export const ARCADE_PLAYER_KEY = 'arcade.current-player.v1';
export const ARCADE_USERS_KEY = 'arcade.users.v1';
/** The family arcade's own addresses: a game under /<game id>/ here is the arcade's game even before the browser has any arcade data. */
export const ARCADE_HOSTS = ['familyarcade.eu', 'www.familyarcade.eu'];

/** The host of an origin, or null when it is empty or not an address. */
function hostOf(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

/**
 * The one rule for "a machine on the developer's own network", used going out to the arcade's dev server and coming back:
 * localhost, 127.0.0.1, [::1], 10/8, 172.16/12, 192.168/16, the tailnet (100.64/10 and *.ts.net), *.local, and the host of
 * `arcadeOrigin` (VITE_ARCADE_ORIGIN) when one is set.
 */
export function isDevHost(hostname: string, arcadeOrigin?: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.ts.net')) return true;
  const extra = hostOf(arcadeOrigin);
  if (extra && extra.toLowerCase() === host) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a > 255 || b > 255 || c > 255 || d > 255) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Where a dev server finds the arcade's dev server. */
export interface DevArcade {
  /** Full origin from VITE_ARCADE_ORIGIN, or empty for `http://<this hostname>:<port>`. */
  origin?: string;
  port: number;
}

export interface ArcadePlayerOptions {
  gameId: string;
  local: Pick<Storage, 'getItem'> | null;
  /** Remembers a trip to the player screen, so a screen that cannot answer never loops. */
  session?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
  location: { hostname?: string; href?: string; origin?: string; pathname: string; search: string; replace(url: string): void };
  /** Pass only from a dev build (`import.meta.env.DEV`); a production build passes nothing and never mentions a dev origin. */
  dev?: DevArcade | null;
  /** The check that the arcade's dev server answers; tests replace it. `signal` aborts it after `PROBE_MS`; a probe that ignores the signal is dropped then all the same. */
  probe?: (origin: string, signal: AbortSignal) => Promise<boolean>;
}

/** How long a probe for the arcade's dev server may take. */
export const PROBE_MS = 1500;

/** Does anything answer at `origin`? A no-cors fetch settles with an opaque reply from any server and fails when nothing listens, or when `signal` stops it. */
async function answers(origin: string, signal: AbortSignal): Promise<boolean> {
  try {
    await fetch(`${origin}/`, { mode: 'no-cors', signal });
    return true;
  } catch {
    return false;
  }
}

export const TRIP_KEY = 'arcade-kit:player-trip';
const TRIP_WINDOW_MS = 15_000;

export function createArcadePlayer({ gameId, local, session = null, now = Date.now, location, dev = null, probe = answers }: ArcadePlayerOptions) {
  const read = (key: string): string | null => {
    try {
      return local?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const lastTrip = (): number => {
    try {
      return Number(session?.getItem(TRIP_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  };
  /** Warned about a malformed VITE_ARCADE_ORIGIN already (dev builds only get this far). */
  let warned = false;
  /**
   * When this page set off for the player screen, in memory: the trip is on its way (or never left) until the window is
   * over. It needs no storage, so it holds in private mode too, and it goes with the page, so a fresh load starts clear.
   * The session stamp is the other fact: it survives the trip, so a screen that sent the child back empty-handed is not
   * visited again at once (`onArcade`, `devOrigin`).
   */
  let tripAt = -Infinity;
  /** Drop the session stamp (a valid player came from the arcade, so the screen did its job). */
  function forgetStamp(): void {
    try {
      if (session?.getItem(TRIP_KEY) != null) session.removeItem(TRIP_KEY);
    } catch {
      /* nothing to forget */
    }
  }
  /** Forget the trip in both stores: the child is back with a player, so the next Who may go there again at once. */
  function forgetTrip(): void {
    tripAt = -Infinity;
    forgetStamp();
  }
  /** This page set off for the player screen less than 15 s ago: it is leaving, or the trip never left (a blocked navigation). */
  function tripPending(): boolean {
    return now() - tripAt < TRIP_WINDOW_MS;
  }

  /** The arcade's dev server for this page, or null: not a dev build, not a dev host, or just back from a trip without a player. */
  function devOrigin(): string | null {
    const host = location.hostname ?? '';
    if (!dev || ARCADE_HOSTS.includes(host) || !isDevHost(host, dev.origin)) return null;
    if (now() - lastTrip() < TRIP_WINDOW_MS) return null;
    if (!dev.origin) return `http://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${dev.port}`;
    let url: URL | null = null;
    try {
      url = new URL(dev.origin);
    } catch {
      /* not an address */
    }
    // an origin is scheme, host and port: a trailing slash or a path on it is dropped
    if (url && (url.protocol === 'http:' || url.protocol === 'https:')) return url.origin;
    if (!warned) {
      warned = true;
      console.warn(`VITE_ARCADE_ORIGIN "${dev.origin}" is not an http(s) origin; the arcade's dev server is not used.`);
    }
    return null;
  }

  /** This page's address to come back to: with its own port, without a fragment. */
  function backUrl(): string {
    try {
      if (location.href) {
        const u = new URL(location.href);
        return `${u.origin}${u.pathname}${u.search}`;
      }
    } catch {
      /* fall through to the path */
    }
    return `${location.origin ?? ''}${location.pathname}${location.search}`;
  }

  /** The probe in flight, shared by every caller until it settles. */
  let probing: Promise<string | null> | null = null;

  return {
    /** Forget the trip to the player screen: the child came back with a player, so the next Who may go there again. */
    forgetTrip,

    tripPending,

    /** The arcade's current player, or null: no key, a corrupt key, or a name or colour the kit refuses. */
    player(): Player | null {
      const raw = read(ARCADE_PLAYER_KEY);
      if (raw === null) return null;
      try {
        const player = cleanPlayer(JSON.parse(raw));
        // a player from the arcade: the stamp has done its job, unless it is this page's own trip's, still on its way
        if (player && !tripPending()) forgetStamp();
        return player;
      } catch {
        return null;
      }
    },

    /**
     * Is this page the arcade's own game? The arcade has left its key here, or
     * this page sits under `/<game id>/` and the arcade has its players here.
     * A corrupt key still counts: the arcade rewrites it the next time it opens.
     */
    onArcade(): boolean {
      // Just came back from the player screen and still no player: show the form rather than go round again.
      if (now() - lastTrip() < TRIP_WINDOW_MS) return false;
      if (read(ARCADE_PLAYER_KEY) !== null) return true;
      const under = location.pathname === `/${gameId}` || location.pathname.startsWith(`/${gameId}/`);
      return under && (read(ARCADE_USERS_KEY) !== null || ARCADE_HOSTS.includes(location.hostname ?? ''));
    },

    /**
     * On a dev server: the origin of the arcade's dev server when it answers, else null. Null instead of a promise when this
     * is not a dev server (or it just sent the child back empty-handed). Callers share one probe while it runs. After
     * `PROBE_MS` the probe is aborted and counts as a no (the race is the backstop for a probe that ignores its signal);
     * a probe that throws is a no too.
     */
    devArcade(): Promise<string | null> | null {
      const origin = devOrigin();
      if (!origin) return null;
      if (!probing) {
        const stop = new AbortController();
        let late: ReturnType<typeof setTimeout>;
        const noAnswer = new Promise<boolean>((resolve) => {
          late = setTimeout(() => {
            stop.abort();
            resolve(false);
          }, PROBE_MS);
        });
        probing = Promise.race([Promise.resolve().then(() => probe(origin, stop.signal)), noAnswer])
          .then(
            (ok) => (ok ? origin : null),
            () => null,
          )
          .finally(() => {
            clearTimeout(late);
            probing = null;
          });
      }
      return probing;
    },

    /** Open the arcade's player screen (on a dev server, the dev server `devArcade` found); it brings the child back to this page. */
    openPlayerScreen(origin: string | null = null): void {
      const back = origin ? backUrl() : location.pathname + location.search;
      tripAt = now();
      try {
        session?.setItem(TRIP_KEY, String(now()));
      } catch {
        /* private mode: the guard is lost, the screen still works */
      }
      location.replace(origin ? `${origin}/#/player?back=${encodeURIComponent(back)}&game=${encodeURIComponent(gameId)}` : `/#/player?back=${encodeURIComponent(back)}`);
    },
  };
}

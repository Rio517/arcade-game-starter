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

/** A phone or laptop on the developer's own network: localhost, 127.0.0.1, the tailnet (100.64-127.x) or the LAN (192.168.x). */
export function isDevHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 168);
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
  location: { hostname?: string; origin?: string; pathname: string; search: string; replace(url: string): void };
  /** Pass only from a dev build (`import.meta.env.DEV`); a production build passes nothing and never mentions a dev origin. */
  dev?: DevArcade | null;
  /** The check that the arcade's dev server answers; tests replace it. */
  probe?: (origin: string) => Promise<boolean>;
}

const PROBE_MS = 1500;

/** Does anything answer at `origin`? A no-cors fetch settles with an opaque reply from any server and fails when nothing listens. */
async function answers(origin: string): Promise<boolean> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PROBE_MS);
  try {
    await fetch(`${origin}/`, { mode: 'no-cors', signal: stop.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const TRIP_KEY = 'arcade-kit:player-trip';
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
  function forgetTrip(): void {
    try {
      if (session?.getItem(TRIP_KEY) != null) session.removeItem(TRIP_KEY);
    } catch {
      /* nothing to forget */
    }
  }

  /** The arcade's dev server for this page, or null: not a dev build, not a dev host, or just back from a trip without a player. */
  function devOrigin(): string | null {
    const host = location.hostname ?? '';
    if (!dev || ARCADE_HOSTS.includes(host) || !isDevHost(host)) return null;
    if (now() - lastTrip() < TRIP_WINDOW_MS) return null;
    return dev.origin || `http://${host}:${dev.port}`;
  }

  return {
    /** The arcade's current player, or null: no key, a corrupt key, or a name or colour the kit refuses. */
    player(): Player | null {
      const raw = read(ARCADE_PLAYER_KEY);
      if (raw === null) return null;
      try {
        const player = cleanPlayer(JSON.parse(raw));
        if (player) forgetTrip();
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

    /** On a dev server: does the arcade's dev server answer? Null when this is not a dev server (or it just sent the child back empty-handed). */
    devArcade(): Promise<boolean> | null {
      const origin = devOrigin();
      return origin ? probe(origin) : null;
    },

    /** Open the arcade's player screen; it brings the child back to this page. */
    openPlayerScreen(): void {
      const origin = devOrigin();
      const back = origin ? `${location.origin ?? `http://${location.hostname}`}${location.pathname}${location.search}` : location.pathname + location.search;
      try {
        session?.setItem(TRIP_KEY, String(now()));
      } catch {
        /* private mode: the guard is lost, the screen still works */
      }
      location.replace(origin ? `${origin}/#/player?back=${encodeURIComponent(back)}&game=${encodeURIComponent(gameId)}` : `/#/player?back=${encodeURIComponent(back)}`);
    },
  };
}

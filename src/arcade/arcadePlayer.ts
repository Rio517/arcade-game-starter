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

export interface ArcadePlayerOptions {
  gameId: string;
  local: Pick<Storage, 'getItem'> | null;
  /** Remembers a trip to the player screen, so a screen that cannot answer never loops. */
  session?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
  location: { pathname: string; search: string; replace(url: string): void };
}

const TRIP_KEY = 'arcade-kit:player-trip';
const TRIP_WINDOW_MS = 15_000;

export function createArcadePlayer({ gameId, local, session = null, now = Date.now, location }: ArcadePlayerOptions) {
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
      return under && read(ARCADE_USERS_KEY) !== null;
    },

    /** Open the arcade's player screen; it brings the child back to this page. */
    openPlayerScreen(): void {
      const back = location.pathname + location.search;
      try {
        session?.setItem(TRIP_KEY, String(now()));
      } catch {
        /* private mode: the guard is lost, the screen still works */
      }
      location.replace(`/#/player?back=${encodeURIComponent(back)}`);
    },
  };
}

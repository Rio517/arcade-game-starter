/**
 * Per-player, per-game saving, plus "who is playing" and "back to the arcade".
 *
 * GitHub Pages gives every repo of one GitHub user the same origin
 * (<user>.github.io), so they all share one localStorage. That is why the game
 * id is part of every key: `arcade-kit:<gameId>:<playerName>:<key>`.
 * The player name is URL-encoded inside the key so a ':' in a name cannot
 * collide with another key.
 */

import { BACK_KEY } from './handoff';
import { cleanPlayer, type Player } from './player';

export const MAX_SAVE_BYTES = 100 * 1024;

export interface StoreOptions {
  gameId: string;
  local: Storage | null;
  session: Storage | null;
  /** The family arcade's own player, when this page is on its origin. It wins over the one kept here. */
  arcadePlayer?: () => Player | null;
}

/** Stand-in used when the browser refuses localStorage (some private windows). */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

export function createStore({ gameId, local, session, arcadePlayer }: StoreOptions) {
  const store: Storage = local ?? memoryStorage();
  const prefix = `arcade-kit:${gameId}:`;
  const playerKey = `${prefix}player`;
  let own: Player | null = null;
  const who = (): Player | null => arcadePlayer?.() ?? own;

  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const isSaveKey = (k: string) => k.startsWith(prefix) && k !== playerKey;
  const fold = (name: string) => name.trim().toLowerCase();

  /**
   * The name a player's saves sit under. The arcade's player keeps the saves a child made here under the same name
   * typed in another case ("klara" for the arcade's "Klara"), as long as nothing is saved under the exact name yet.
   */
  function savesName(p: Player): string {
    if (!arcadePlayer?.()) return p.name;
    const names = new Set<string>();
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k || !isSaveKey(k)) continue;
      const end = k.indexOf(':', prefix.length);
      if (end < 0) continue;
      try {
        names.add(decodeURIComponent(k.slice(prefix.length, end)));
      } catch {
        /* not a key this kit wrote */
      }
    }
    if (names.has(p.name)) return p.name;
    return [...names].sort().find((n) => fold(n) === fold(p.name)) ?? p.name;
  }
  const keyFor = (p: Player, key: string) => `${prefix}${encodeURIComponent(savesName(p))}:${key}`;

  try {
    own = cleanPlayer(JSON.parse(store.getItem(playerKey) ?? 'null'));
  } catch {
    own = null;
  }

  function usedBytes(): number {
    let total = 0;
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && isSaveKey(k)) total += bytes(store.getItem(k) ?? '');
    }
    return total;
  }

  return {
    player: (): Player | null => {
      const p = who();
      return p ? { ...p } : null;
    },

    setPlayer(p: Player): void {
      const clean = cleanPlayer(p);
      if (!clean) {
        throw new Error('arcade.setPlayer: a player needs a name of 1 to 20 characters and a colour like "#e0405f".');
      }
      own = clean;
      try {
        store.setItem(playerKey, JSON.stringify(clean));
      } catch {
        /* remembered for this visit only */
      }
    },

    save(key: string, value: unknown): void {
      if (typeof key !== 'string' || key === '') throw new Error('arcade.save: the key must be a non-empty string.');
      const current = who();
      if (!current) throw new Error('arcade.save: nobody is playing yet. Call arcade.setPlayer(...) or arcade.ui.ensurePlayer(...) first.');
      const full = keyFor(current, key);
      if (value === undefined) {
        store.removeItem(full);
        return;
      }
      let json: string | undefined;
      try {
        json = JSON.stringify(value);
      } catch {
        json = undefined;
      }
      if (json === undefined) {
        throw new Error(`arcade.save("${key}"): that value cannot be saved. Use numbers, text, true/false, lists and plain objects.`);
      }
      const total = usedBytes() - bytes(store.getItem(full) ?? '') + bytes(json);
      if (total > MAX_SAVE_BYTES) {
        throw new Error(
          `arcade.save("${key}"): this game may save at most 100 KB in all, and this would make ${Math.ceil(total / 1024)} KB. Save less, or remove old things with arcade.save(key, undefined).`,
        );
      }
      try {
        store.setItem(full, json);
      } catch {
        throw new Error(`arcade.save("${key}"): the browser has no room to save right now.`);
      }
    },

    load<T>(key: string): T | undefined {
      const current = who();
      if (!current) return undefined;
      const raw = store.getItem(keyFor(current, key));
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },

    backUrl(): string | null {
      try {
        return session?.getItem(BACK_KEY) ?? null;
      } catch {
        return null;
      }
    },
  };
}

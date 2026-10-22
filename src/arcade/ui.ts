/**
 * The kit's two small screens: the player card and "Play together".
 *
 * Plain DOM, styles injected from here (nothing is fetched from anywhere).
 * Tap targets are 48px or more, text is 16px or more, everything works with a
 * keyboard, and Escape closes the panels. Names from other players are only
 * ever put on screen with textContent, never as HTML.
 */

import { PROBE_MS } from './arcadePlayer';
import { cleanName, type Player } from './player';
import type { Person, Room, Together } from './together';

export const PLAYER_COLOURS = ['#e0405f', '#f08a24', '#e8c11c', '#3fae5a', '#2fb5b0', '#3d6bd6', '#8a56d6', '#d64fa8'];

const CSS = `
.ak-btn{min-height:48px;min-width:48px;padding:10px 20px;font:600 18px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;border-radius:14px;border:2px solid #fff;background:#2a3350;color:#fff;cursor:pointer;touch-action:manipulation}
.ak-btn:hover{background:#34406a}
.ak-btn.ak-primary{background:#3d6bd6;border-color:#9db8f2}
.ak-btn.ak-primary:hover{background:#4a79e6}
.ak-btn:disabled{opacity:.6;cursor:default}
.ak-btn:focus-visible,.ak-input:focus-visible,.ak-swatch:focus-visible{outline:4px solid #ffd54a;outline-offset:3px}
.ak-together{position:relative;display:inline-block;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.ak-panel{position:absolute;z-index:50;bottom:calc(100% + 10px);right:0;width:min(340px,calc(100vw - 32px));box-sizing:border-box;padding:18px;border-radius:18px;background:#1b2238;color:#fff;border:2px solid #5a6aa0;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:18px;line-height:1.35}
.ak-panel[hidden]{display:none}
.ak-panel h2{margin:0 48px 12px 0;font-size:20px}
.ak-close{position:absolute;top:6px;right:6px;padding:0;font-size:26px}
.ak-row{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.ak-row .ak-btn{flex:1 1 140px}
.ak-code{font:800 56px/1.1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;text-align:center;margin:8px 0 4px;padding-left:.14em;user-select:all}
.ak-hint{margin:4px 0 10px;font-size:16px;color:#c9d2f0;text-align:center}
.ak-input{box-sizing:border-box;width:100%;min-height:48px;padding:8px 14px;font:700 24px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.2em;text-transform:uppercase;text-align:center;border-radius:12px;border:2px solid #9db8f2;background:#0f1424;color:#fff}
.ak-input.ak-name{font:600 20px/1.2 system-ui,sans-serif;letter-spacing:0;text-transform:none;text-align:left}
.ak-people{list-style:none;margin:10px 0;padding:0;display:grid;gap:6px}
.ak-people li{display:flex;align-items:center;gap:10px;min-height:36px;font-size:18px}
.ak-dot{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid #fff}
.ak-tag{font-size:16px;color:#c9d2f0}
.ak-error{margin:8px 0;padding:10px 12px;border-radius:10px;background:#5a1f2c;color:#fff;font-size:16px}
.ak-status{margin:6px 0;font-size:16px;color:#c9d2f0}
.ak-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,10,20,.82);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.ak-card{box-sizing:border-box;width:min(420px,100%);max-height:100%;overflow:auto;padding:22px;border-radius:20px;background:#1b2238;color:#fff;border:2px solid #5a6aa0;font-size:18px}
.ak-card h2{margin:0 0 14px;font-size:24px}
.ak-card label{display:block;margin:14px 0 6px;font-size:16px;font-weight:600;color:#c9d2f0}
.ak-swatches{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 16px}
.ak-swatch{width:48px;height:48px;border-radius:50%;border:3px solid transparent;cursor:pointer;color:#fff;font:700 24px/1 system-ui,sans-serif;touch-action:manipulation}
.ak-swatch[aria-checked="true"]{border-color:#fff;box-shadow:0 0 0 3px #1b2238,0 0 0 6px #fff}
@media (prefers-reduced-motion:no-preference){.ak-btn{transition:background .15s}}
`;

function injectStyles(): void {
  if (document.getElementById('ak-styles')) return;
  const style = document.createElement('style');
  style.id = 'ak-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

type Props = Record<string, string>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) node.append(kid);
  return node;
}

let uid = 0;

// ── Player card ────────────────────────────────────────────────────────

export interface PlayerUi {
  playerPicker(container: HTMLElement): Promise<Player>;
  ensurePlayer(container: HTMLElement): Promise<Player>;
  togetherPanel(container: HTMLElement): TogetherPanel;
  /** Drop the kit's window listener. A game never needs this; tests do. */
  dispose(): void;
}

export interface TogetherPanel {
  /** Called with the room when this device makes or joins one, and with null when it leaves. */
  onRoom(cb: (room: Room | null) => void): () => void;
  room(): Room | null;
  open(): void;
  close(): void;
  destroy(): void;
}

interface UiDeps {
  getPlayer: () => Player | null;
  setPlayer: (p: Player) => void;
  together: Together;
  /** On the family arcade's origin (and from a dev server when the arcade's dev server answers) the arcade's own player screen replaces this form. */
  arcade?: ArcadeScreen;
}

/** What the player card needs of the arcade (`createArcadePlayer`). */
export interface ArcadeScreen {
  onArcade(): boolean;
  /** Leave for the arcade's player screen; it brings the child back to this page. */
  openPlayerScreen(origin?: string | null): void;
  /** On a dev server, a probe for the arcade's dev server: its origin, or null when nothing answers. Null (no promise) off a dev server. */
  devArcade(): Promise<string | null> | null;
  /** This page set off for the player screen less than 15 s ago. */
  tripPending(): boolean;
  /** Forget that trip: the child is back (a handoff, or a swipe back that restored this page from the bfcache). */
  forgetTrip(): void;
}

/**
 * Where a press of Who is. Each step is judged by a fact that cannot go stale (see `alive`), never by a flag that
 * something has to remember to clear: a probe settles, a card is on the page or not, a trip is inside its window or not.
 */
type Step = { kind: 'probe' } | { kind: 'form'; overlay: HTMLElement; close(): void } | { kind: 'trip' };

/**
 * One press of Who and every press that joined it: the one promise all of them get. A form's or a probe's promise
 * settles with the player picked; a trip's is meant to end with the page (the arcade's screen brings the child back to
 * a fresh load), and when the page stays or comes back instead, it settles with the next pick's answer.
 */
interface PickState {
  /** Null only when the form itself could not be built (the kit's own fault); callers see `Promise<Player>`. */
  promise: Promise<Player | null>;
  settle(p: Player | null | PromiseLike<Player | null>): void;
  step: Step;
}

/** A probe may take `PROBE_MS`; this much later the kit stops waiting for one that never settles. */
const PROBE_MARGIN_MS = 500;

export function createUi({ getPlayer, setPlayer, together, arcade }: UiDeps): PlayerUi {
  /** The pick on its way, or null. */
  let current: PickState | null = null;

  /** Is the pick still going? A probe always (it becomes a form or a trip); a form while its card is on the page; a trip inside the arcade's 15 s window. */
  function alive(pick: PickState): boolean {
    const step = pick.step;
    if (step.kind === 'probe') return true;
    if (step.kind === 'form') return step.overlay.isConnected;
    return arcade?.tripPending() ?? false;
  }

  /**
   * Who was pressed. While a pick is alive every press gets its promise: one probe, one card, one trip, and one answer
   * for all of them. A pick that ended without an answer (a trip that never left the page, a card the page took down)
   * is replaced, and its callers get the new pick's answer: no promise here is left without a way to settle.
   */
  function playerPicker(container: HTMLElement): Promise<Player> {
    if (current && alive(current)) return current.promise as Promise<Player>;
    const stale = current;
    if (stale?.step.kind === 'form') stale.step.close(); // its card is gone already; its keydown listener goes too
    let settle!: PickState['settle'];
    const promise = new Promise<Player | null>((resolve) => {
      settle = resolve;
    });
    const pick: PickState = { promise, settle, step: { kind: 'probe' } };
    current = pick;
    void promise.then(() => {
      if (current === pick) current = null;
    });
    stale?.settle(promise);
    void begin(container, pick);
    return promise as Promise<Player>;
  }

  /** The probe's answer, or null when none has come `PROBE_MARGIN_MS` after its own time: an arcade whose probe never settles cannot keep a pick alive. */
  function expires(probe: Promise<string | null>): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout>;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PROBE_MS + PROBE_MARGIN_MS);
    });
    return Promise.race([probe, late]).finally(() => clearTimeout(timer));
  }

  /**
   * The pick's start: one chain, one failure path. A throw anywhere before the form (the arcade, the probe, the
   * navigation) ends in exactly one form. A throw from the form itself ends the pick with null, so the next Who starts
   * over. Nothing here is left to reject.
   */
  async function begin(container: HTMLElement, pick: PickState): Promise<void> {
    let formed = false;
    try {
      if (arcade?.onArcade()) return trip(pick, null);
      // on a dev server: the arcade's dev server when one answers, otherwise the form; a probe that fails or hangs is a no
      const probe = arcade?.devArcade();
      const origin = probe ? await expires(probe) : null;
      if (origin) return trip(pick, origin);
      formed = true;
      form(container, pick);
    } catch {
      if (!formed) {
        formed = true;
        try {
          form(container, pick);
          return;
        } catch {
          /* the form itself threw: below */
        }
      }
      // the form could not be built (the kit's own fault): take down what it made, and end the pick
      if (pick.step.kind === 'form') pick.step.close();
      if (current === pick) current = null;
      pick.settle(null);
    }
  }

  /** Leave for the arcade's player screen (from a dev server, at the origin that answered). The page is going, so the promise waits: for the unload, or for the next Who if it never leaves. */
  function trip(pick: PickState, origin: string | null): void {
    pick.step = { kind: 'trip' };
    arcade!.openPlayerScreen(origin);
  }

  // If a swipe back from the arcade's player screen ever restores this document from the bfcache with its trip still
  // on its way: forget the trip, so the next Who starts fresh (the form, or a new trip on the arcade), and when the child
  // picked a player meanwhile, that answers the pick now; otherwise the next Who's answer does (the pick is no longer
  // alive). Whether that restore happens is not known: openPlayerScreen leaves with location.replace, and a browser may
  // never bring this document back. The handler costs nothing, so it stays; it is not a promise about any device.
  const onPageShow = (e: Event) => {
    if (!(e as PageTransitionEvent).persisted) return;
    arcade?.forgetTrip();
    if (current?.step.kind !== 'trip') return;
    const p = getPlayer();
    if (p) current.settle(p);
  };
  if (typeof window !== 'undefined') window.addEventListener('pageshow', onPageShow);

  function dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('pageshow', onPageShow);
  }

  function form(container: HTMLElement, pick: PickState): void {
    injectStyles();
    const existing = getPlayer();
    const id = ++uid;
    let colour = existing?.colour ?? PLAYER_COLOURS[Math.floor(Math.random() * PLAYER_COLOURS.length)];
    const input = el('input', { class: 'ak-input ak-name', id: `ak-name-${id}`, type: 'text', maxlength: '20', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false' });
    input.value = existing?.name ?? '';
    const error = el('div', { class: 'ak-error', role: 'alert', hidden: '' });
    const swatches = el('div', { class: 'ak-swatches', role: 'radiogroup', 'aria-label': 'Colour' });
    const buttons = PLAYER_COLOURS.map((c, i) => {
      const b = el('button', { class: 'ak-swatch', type: 'button', role: 'radio', 'aria-label': `Colour ${i + 1}` });
      b.style.background = c;
      b.addEventListener('click', () => {
        colour = c;
        paint();
      });
      swatches.append(b);
      return b;
    });
    const paint = () =>
      buttons.forEach((b, i) => {
        const on = PLAYER_COLOURS[i] === colour;
        b.setAttribute('aria-checked', String(on));
        b.textContent = on ? '✓' : '';
      });
    paint();

    const go = el('button', { class: 'ak-btn ak-primary', type: 'button' }, "Let's play");
    const card = el('div', { class: 'ak-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `ak-title-${id}` });
    card.append(el('h2', { id: `ak-title-${id}` }, existing ? 'Player' : 'New player'), el('label', { for: `ak-name-${id}` }, 'Name'), input, el('label', {}, 'Colour'), swatches, error, go);
    const overlay = el('div', { class: 'ak-overlay' }, card);

    /** Take the card down and stop listening. */
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
    };
    const done = (p: Player) => {
      close();
      pick.settle(p);
    };
    const submit = () => {
      const name = cleanName(input.value);
      if (!name) {
        error.textContent = 'Type a name with 1 to 20 letters.';
        error.hidden = false;
        input.focus();
        return;
      }
      const p = { name, colour };
      setPlayer(p);
      done(p);
    };
    const onKey = (e: KeyboardEvent) => {
      // the page took the card down itself (a re-render): this listener is stale, and the next Who answers the pick
      if (!overlay.isConnected) return close();
      if (e.key === 'Escape' && existing) {
        e.preventDefault();
        done(existing);
      } else if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Tab') {
        const items = [...card.querySelectorAll<HTMLElement>('input,button')];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    go.addEventListener('click', submit);
    document.addEventListener('keydown', onKey, true);
    pick.step = { kind: 'form', overlay, close };
    container.append(overlay);
    input.focus();
  }

  function ensurePlayer(container: HTMLElement): Promise<Player> {
    const p = getPlayer();
    return p ? Promise.resolve(p) : playerPicker(container);
  }

  // ── Play together ────────────────────────────────────────────────────

  function togetherPanel(container: HTMLElement): TogetherPanel {
    injectStyles();
    const id = ++uid;
    const roomCbs = new Set<(r: Room | null) => void>();
    let room: Room | null = null;
    let offRoom: Array<() => void> = [];
    let busy = '';
    let error = '';
    let showJoin = false;
    let isOpen = false;

    const root = el('div', { class: 'ak-together' });
    const toggle = el('button', { class: 'ak-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': `ak-panel-${id}` });
    const panel = el('div', { class: 'ak-panel', id: `ak-panel-${id}`, role: 'dialog', 'aria-label': 'Play together', hidden: '' });
    const body = el('div');
    const closeBtn = el('button', { class: 'ak-btn ak-close', type: 'button', 'aria-label': 'Close' }, '×');
    panel.append(closeBtn, body);
    root.append(toggle, panel);
    container.append(root);

    const setOpen = (open: boolean, focus = true) => {
      isOpen = open;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) {
        render();
        if (focus) (panel.querySelector<HTMLElement>('.ak-btn.ak-primary, .ak-input, .ak-btn:not(.ak-close)') ?? closeBtn).focus();
      } else if (focus) toggle.focus();
    };

    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onDocKey);
    toggle.addEventListener('click', () => setOpen(!isOpen));
    closeBtn.addEventListener('click', () => setOpen(false));

    const announce = (r: Room | null) => {
      for (const cb of [...roomCbs]) cb(r);
    };

    const adopt = (r: Room) => {
      room = r;
      error = '';
      busy = '';
      showJoin = false;
      offRoom = [
        r.onPeople(() => render()),
        r.onStatus((s, detail) => {
          if (s === 'left') {
            if (room === r) {
              drop();
              render();
            }
            return;
          }
          if (s === 'error') error = detail ?? 'The connection was lost.';
          else if (s === 'connected') error = '';
          render();
        }),
      ];
      announce(r);
      render();
    };

    const drop = () => {
      if (!room) return;
      for (const off of offRoom) off();
      offRoom = [];
      room = null;
      announce(null);
    };

    const leave = () => {
      room?.leave();
      drop();
      error = '';
      render();
      toggle.focus();
    };

    const start = async (job: () => Promise<Room>, label: string) => {
      busy = label;
      error = '';
      render();
      try {
        adopt(await job());
      } catch (e) {
        busy = '';
        error = e instanceof Error ? e.message : String(e);
        render();
      }
    };

    function peopleList(people: Person[]): HTMLElement {
      const ul = el('ul', { class: 'ak-people', 'aria-label': 'Who is here' });
      for (const p of people) {
        const dot = el('span', { class: 'ak-dot', 'aria-hidden': 'true' });
        dot.style.background = p.colour;
        const tags = [p.isHost ? 'host' : '', p.me ? 'you' : ''].filter(Boolean).join(', ');
        ul.append(el('li', {}, dot, el('span', {}, p.name), ...(tags ? [el('span', { class: 'ak-tag' }, `(${tags})`)] : [])));
      }
      return ul;
    }

    function render(): void {
      const me = getPlayer();
      toggle.textContent = room ? `Room ${room.code}` : 'Play together';
      if (!isOpen) return;
      body.replaceChildren();
      const add = (...n: Node[]) => body.append(...n);
      const active = document.activeElement;
      const hadInput = active instanceof HTMLInputElement && body.contains(active);
      const typed = hadInput ? (active as HTMLInputElement).value : '';

      if (room) {
        const hosting = room.isHost;
        add(el('h2', {}, hosting ? 'Your code' : 'Joined'));
        add(el('div', { class: 'ak-code', 'aria-label': `Code ${room.code.split('').join(' ')}` }, room.code));
        add(el('p', { class: 'ak-hint' }, hosting ? 'Friends tap "I have a code" and type this.' : 'You are in this game.'));
        add(peopleList(room.people));
        if (error) add(el('div', { class: 'ak-error', role: 'alert' }, error));
        else if (room.status === 'reconnecting') add(el('div', { class: 'ak-status', role: 'status' }, 'Reconnecting…'));
        else if (room.status === 'waiting' && hosting) add(el('div', { class: 'ak-status', role: 'status' }, 'Waiting for friends…'));
        const leaveBtn = el('button', { class: 'ak-btn', type: 'button' }, 'Leave');
        leaveBtn.addEventListener('click', leave);
        add(el('div', { class: 'ak-row' }, leaveBtn));
        return;
      }

      add(el('h2', {}, 'Play together'));
      if (me) add(el('p', { class: 'ak-status' }, `Playing as ${me.name}`));
      if (busy) {
        add(el('div', { class: 'ak-status', role: 'status' }, busy));
      } else {
        const make = el('button', { class: 'ak-btn ak-primary', type: 'button' }, 'Make a code');
        make.addEventListener('click', () => void start(() => together.host(), 'Making your code…'));
        const have = el('button', { class: 'ak-btn', type: 'button' }, 'I have a code');
        have.addEventListener('click', () => {
          showJoin = true;
          error = '';
          render();
          body.querySelector<HTMLInputElement>('.ak-input')?.focus();
        });
        add(el('div', { class: 'ak-row' }, make, have));
        if (showJoin) {
          const input = el('input', { class: 'ak-input', type: 'text', maxlength: '4', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Four-letter code', placeholder: 'ABCD' });
          input.value = typed;
          const go = el('button', { class: 'ak-btn ak-primary', type: 'button' }, 'Join');
          const submit = () => void start(() => together.join(input.value), 'Joining…');
          go.addEventListener('click', submit);
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          });
          add(input, el('div', { class: 'ak-row' }, go));
        }
      }
      if (error) add(el('div', { class: 'ak-error', role: 'alert' }, error));
    }

    render();
    return {
      onRoom(cb) {
        roomCbs.add(cb);
        return () => void roomCbs.delete(cb);
      },
      room: () => room,
      open: () => setOpen(true),
      close: () => setOpen(false, false),
      destroy() {
        document.removeEventListener('keydown', onDocKey);
        room?.leave();
        drop();
        root.remove();
      },
    };
  }

  return { playerPicker, ensurePlayer, togetherPanel, dispose };
}

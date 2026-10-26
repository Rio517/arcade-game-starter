/**
 * The pause button and the pause menu: the same place and the same way out in every game.
 *
 * The button sits top right, inside the safe area, with Help beside it when the game has help. The menu is
 * always Resume, then the game's own items, then Help, then Exit, last. Exit saves first, then goes back to
 * the arcade when the game was opened from there, otherwise to the game's start screen.
 *
 * Exit asks for one more press: the first press turns it into "Yes, exit", and only a second press (at least
 * ARM_MS later, so a double tap counts once) leaves. A child who taps it by accident sees the change and
 * taps Resume.
 *
 * A game's Settings or help stacks over the menu as a panel (`pause.panel`) with a Back button; Escape walks
 * back one layer at a time, then resumes, and the game stays paused throughout.
 *
 * The menu's DOM is built once; opening, closing, showing and hiding only toggle it. Plain DOM, styles injected from
 * here, words from words.ts. Shapes and colours are the game's to change through the `--ak-pause-*` custom
 * properties and the `ak-pause-*` classes (README, "The pause button").
 */

import { kt } from './words';

export interface PauseItem {
  /** The item's words, 1 to 4 words naming the action ("Restart"). Put them in your words catalog. */
  label: string;
  /** Runs with the menu still open; call `pause.close()` in here to go back to play. */
  onSelect: () => void;
  /** Shown only while this returns true, asked each time the menu opens (a Map that unlocks mid-game). Always shown if left out. */
  visible?: () => boolean;
  /** A name for `pause.open({ focus: id })`. 'help' and 'exit' are the kit's own. */
  id?: string;
}

export interface PauseMenuOptions {
  /** The game stops its loop (the menu just opened). */
  onPause: () => void;
  /** The game starts its loop again (Resume, Escape or P). Clear held keys and fingers here: the game saw them
   * go down before the pause and may not have seen them come up. */
  onResume: () => void;
  /** Forget every held key and pressed button now, as on a window blur. Called as the menu opens, before onPause. */
  releaseKeys?: () => void;
  /** A short line under the title ("3D view stopped"), read out as status. Change it with `pause.setStatus`. */
  status?: string;
  /** Save progress. Exit waits for it; when it throws or rejects, the player stays in the menu. */
  save: () => void | Promise<void>;
  /** Where Exit goes when the game was not opened from the arcade: show your start screen. */
  toStart: () => void;
  /** Show your help. Adds a help button beside pause and a Help item in the menu. Show it with `pause.panel()`
   * and the kit tracks it; help of your own calls `pause.helpClosed()` when it goes away. */
  help?: () => void;
  /** True while the game can't stop (a play-together room runs on for everyone). The menu still opens, with Exit, but onPause and onResume aren't called and the title says the game goes on. */
  live?: () => boolean;
  /** Your own items (Restart, Settings, Map), between Resume and Help. */
  items?: PauseItem[];
  /** Where the button and the menu go. document.body if left out. */
  container?: HTMLElement;
}

export interface PauseMenu {
  /** Pause: calls onPause and shows the menu. `focus` names the item to focus (an item's id, 'help' or 'exit');
   * Resume when left out or hidden. When the menu is open already, only moves the focus. */
  open(options?: { focus?: string }): void;
  /** Resume: closes every panel, hides the menu and calls onResume. Does nothing while Exit is saving. */
  close(): void;
  /** Put your element over the menu, under `title`, with a Back button. Escape and P go back one layer; Back
   * gives the focus to the item that opened it. Opens the menu first (paused) when it is closed, and closes it
   * again with the panel. Returns the function that closes the panel. */
  panel(el: HTMLElement, options: { title: string }): () => void;
  /** Change the line under the title; null takes it away. */
  setStatus(text: string | null): void;
  /** Your own help (not a `panel`) has closed: the help button shows it as closed again. */
  helpClosed(): void;
  isOpen(): boolean;
  /** Show the pause button during play, hide it on other screens. Exit to the start screen hides it for you. */
  setVisible(visible: boolean): void;
  /** A disabled pause button stays in place but ignores presses and keys (a countdown, a cut scene). */
  setDisabled(disabled: boolean): void;
  /** Take everything off the page and drop every listener. */
  destroy(): void;
}

/** What Exit needs of the arcade (`arcade.cameFromArcade` and `arcade.backToArcade`). */
export interface PauseNav {
  cameFromArcade(): boolean;
  backToArcade(): void;
}

/** The second press of Exit counts only this long after the first, so a double tap is one press. */
export const ARM_MS = 400;

const CSS = `
.ak-pause-bar{position:fixed;z-index:80;top:calc(env(safe-area-inset-top,0px) + var(--ak-pause-edge,6px));right:calc(env(safe-area-inset-right,0px) + var(--ak-pause-edge,6px));display:flex;gap:var(--ak-pause-gap,4px);font-family:var(--ak-pause-font,system-ui,-apple-system,"Segoe UI",sans-serif)}
.ak-pause-bar[hidden],.ak-pause-scrim[hidden],.ak-pause-menu[hidden],.ak-pause-error[hidden],.ak-pause-status[hidden]{display:none}
.ak-pause-btn{box-sizing:content-box;width:var(--ak-pause-size,48px);height:var(--ak-pause-size,48px);padding:6px;margin:0;border:0;background:none;color:var(--ak-pause-fg,#fff);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
.ak-pause-face{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:var(--ak-pause-radius,14px);border:2px solid var(--ak-pause-line,#9db8f2);background:var(--ak-pause-bg,#2a3350);font:700 24px/1 var(--ak-pause-font,system-ui,-apple-system,"Segoe UI",sans-serif)}
.ak-pause-bars{box-sizing:border-box;width:18px;height:20px;border-left:6px solid currentColor;border-right:6px solid currentColor}
.ak-pause-btn:hover .ak-pause-face{background:var(--ak-pause-bg-hover,#34406a)}
.ak-pause-btn:active .ak-pause-face,.ak-pause-btn[data-pressed] .ak-pause-face{background:var(--ak-pause-bg-pressed,#1b2238);box-shadow:0 0 0 6px var(--ak-pause-ring,rgba(157,184,242,.55))}
.ak-pause-btn:disabled{cursor:default}
.ak-pause-btn:disabled .ak-pause-face{opacity:.45;border-style:dashed;box-shadow:none;background:var(--ak-pause-bg,#2a3350)}
.ak-pause-btn:focus{outline:none}
.ak-pause-btn:focus-visible .ak-pause-face{outline:4px solid var(--ak-focus,#ffd54a);outline-offset:3px}
.ak-pause-scrim{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:var(--ak-pause-scrim,rgba(8,10,20,.78));font-family:var(--ak-pause-font,system-ui,-apple-system,"Segoe UI",sans-serif);touch-action:none}
.ak-pause-menu{box-sizing:border-box;width:min(360px,100%);max-height:100%;overflow:auto;padding:20px;border-radius:var(--ak-pause-menu-radius,20px);border:2px solid var(--ak-pause-menu-line,#5a6aa0);background:var(--ak-pause-menu-bg,#1b2238);color:var(--ak-pause-fg,#fff)}
.ak-pause-title{margin:0 0 14px;font-size:24px;line-height:1.2;text-align:center}
.ak-pause-items{display:grid;gap:10px}
.ak-pause-status{margin:-6px 0 14px;font-size:16px;line-height:1.35;text-align:center;color:var(--ak-pause-status-fg,#c9d4f2)}
.ak-pause-layer{display:flex;flex-direction:column;overflow:hidden}
.ak-pause-layer-body{flex:1 1 auto;min-height:0;overflow:auto;margin:0 0 14px;font-size:18px;line-height:1.4}
.ak-pause-back{flex:none}
.ak-pause-item{box-sizing:border-box;min-height:56px;width:100%;padding:10px 20px;border-radius:var(--ak-pause-item-radius,14px);border:2px solid var(--ak-pause-line,#9db8f2);background:var(--ak-pause-item-bg,#2a3350);color:var(--ak-pause-fg,#fff);font:600 20px/1.2 var(--ak-pause-font,system-ui,-apple-system,"Segoe UI",sans-serif);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ak-pause-item:hover{background:var(--ak-pause-bg-hover,#34406a)}
.ak-pause-resume{background:var(--ak-pause-primary-bg,#3d6bd6)}
.ak-pause-resume:hover{background:var(--ak-pause-primary-bg-hover,#4a79e6)}
.ak-pause-item:active,.ak-pause-item[data-pressed]{background:var(--ak-pause-bg-pressed,#1b2238);box-shadow:0 0 0 5px var(--ak-pause-ring,rgba(157,184,242,.55))}
.ak-pause-exit.ak-armed{border-width:4px;border-style:solid;border-color:var(--ak-pause-armed-line,#ffb86b);font-weight:800}
.ak-pause-item:disabled{opacity:.6;cursor:default;border-style:dashed;box-shadow:none}
.ak-pause-item:focus{outline:none}
.ak-pause-item:focus-visible{outline:4px solid var(--ak-focus,#ffd54a);outline-offset:3px}
.ak-pause-error{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--ak-pause-error-bg,#5a1f2c);color:#fff;font-size:16px;line-height:1.35;text-align:center}
@media (max-height:460px){.ak-pause-menu{width:min(520px,100%);padding:14px}.ak-pause-title{margin-bottom:10px;font-size:20px}.ak-pause-items{grid-template-columns:1fr 1fr}.ak-pause-item{min-height:52px}}
@media (prefers-reduced-motion:no-preference){.ak-pause-face,.ak-pause-item{transition:background .12s}.ak-pause-menu{animation:ak-pause-in .16s ease-out}@keyframes ak-pause-in{from{opacity:0;transform:translateY(8px)}}}
`;

function injectStyles(): void {
  if (document.getElementById('ak-pause-styles')) return;
  const style = document.createElement('style');
  style.id = 'ak-pause-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function button(className: string, label: string, ariaLabel?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (label) b.textContent = label;
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  return b;
}

function face(...kids: Node[]): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'ak-pause-face';
  span.setAttribute('aria-hidden', 'true');
  span.append(...kids);
  return span;
}

/** Is the key going into a text field? Then P is a letter, not a pause. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** What Tab can reach inside a panel. */
function focusables(root: HTMLElement): HTMLElement[] {
  const all = root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]');
  return Array.prototype.filter.call(all, (el: HTMLElement) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.closest('[hidden]')) as HTMLElement[];
}

/** Keys the open menu acts on. Every keydown stops at the menu (the paused game hears no presses); every keyup
 * reaches the game, so a key held when the menu opened never sticks. */
const MENU_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', ' '];

let uid = 0;

export function createPauseMenu(options: PauseMenuOptions, nav: PauseNav): PauseMenu {
  injectStyles();
  const container = options.container ?? document.body;
  const id = ++uid;

  // ── the button (and help beside it) ──
  const bar = document.createElement('div');
  bar.className = 'ak-pause-bar';
  bar.hidden = true;
  const helpButton = options.help ? button('ak-pause-btn ak-pause-help', '', kt('kit.pause.help')) : null;
  if (helpButton) {
    helpButton.append(face(document.createTextNode('?')));
    helpButton.setAttribute('aria-expanded', 'false');
    bar.append(helpButton);
  }
  const bars = document.createElement('span');
  bars.className = 'ak-pause-bars';
  const toggle = button('ak-pause-btn ak-pause-toggle', '', kt('kit.pause.pause'));
  toggle.append(face(bars));
  toggle.setAttribute('aria-keyshortcuts', 'Escape P');
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `ak-pause-menu-${id}`);
  bar.append(toggle);

  // ── the menu: Resume, the game's items, Help, Exit ──
  const scrim = document.createElement('div');
  scrim.className = 'ak-pause-scrim';
  scrim.hidden = true;
  const menu = document.createElement('div');
  menu.className = 'ak-pause-menu';
  menu.id = `ak-pause-menu-${id}`;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-labelledby', `ak-pause-title-${id}`);
  const title = document.createElement('h2');
  title.className = 'ak-pause-title';
  title.id = `ak-pause-title-${id}`;
  title.textContent = kt('kit.pause.title');
  const list = document.createElement('div');
  list.className = 'ak-pause-items';
  const resume = button('ak-pause-item ak-pause-resume', kt('kit.pause.resume'));
  const own = (options.items ?? []).map((item) => {
    const b = button('ak-pause-item', item.label);
    b.addEventListener('click', () => {
      if (busy) return;
      disarm();
      select(b, item.onSelect);
    });
    return b;
  });
  const helpItem = options.help ? button('ak-pause-item ak-pause-help-item', kt('kit.pause.help')) : null;
  const exit = button('ak-pause-item ak-pause-exit', kt('kit.pause.exit'));
  const items = [resume, ...own, ...(helpItem ? [helpItem] : []), exit];
  list.append(...items);
  const byId = new Map<string, HTMLButtonElement>();
  (options.items ?? []).forEach((item, i) => item.id && byId.set(item.id, own[i]));
  if (helpItem) byId.set('help', helpItem);
  byId.set('exit', exit);
  const status = document.createElement('p');
  status.className = 'ak-pause-status';
  status.setAttribute('role', 'status');
  const error = document.createElement('p');
  error.className = 'ak-pause-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  menu.append(title, status, list, error);
  setStatus(options.status ?? null);
  scrim.append(menu);
  container.append(bar, scrim);

  let open = false;
  let disabled = false;
  let busy = false;
  let armedAt = -1;
  let paused = false;
  /** The button whose action is running: a panel it opens gives the focus back to it. */
  let selecting: HTMLElement | null = null;
  /** help() is running: a panel it opens is the help. */
  let helpRunning = false;

  /** A panel over the menu. `ownsMenu`: it opened the menu, so the menu closes with it. */
  interface Layer {
    box: HTMLElement;
    el: HTMLElement;
    opener: HTMLElement | null;
    ownsMenu: boolean;
    help: boolean;
    closed: boolean;
  }
  const layers: Layer[] = [];
  let layerCount = 0;

  function select(from: HTMLElement, run: () => void): void {
    const was = selecting;
    selecting = from;
    try {
      run();
    } finally {
      selecting = was;
    }
  }

  function setStatus(text: string | null): void {
    status.textContent = text ?? '';
    status.hidden = !text;
  }

  function setHelpShown(on: boolean): void {
    helpButton?.setAttribute('aria-expanded', String(on));
  }

  function showHelp(from: HTMLElement): void {
    if (!options.help) return;
    const before = layers.length;
    helpRunning = true;
    try {
      select(from, options.help);
    } finally {
      helpRunning = false;
    }
    if (layers.length === before) setHelpShown(true); // the game's own help: shown until helpClosed()
  }

  /** The box on top: the last panel, or the menu. */
  function top(): HTMLElement {
    return layers.length ? layers[layers.length - 1].box : menu;
  }

  function shown(el: HTMLElement | null): el is HTMLElement {
    return !!el && el.isConnected && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled;
  }

  function disarm(): void {
    if (armedAt < 0) return;
    armedAt = -1;
    exit.textContent = kt('kit.pause.exit');
    exit.classList.remove('ak-armed');
  }

  function setBusy(on: boolean): void {
    busy = on;
    for (const b of items) b.disabled = on;
    menu.setAttribute('aria-busy', String(on));
    exit.textContent = on ? kt('kit.pause.saving') : kt('kit.pause.exit');
  }

  function dropLayer(layer: Layer): void {
    layer.closed = true;
    layer.el.remove();
    layer.box.remove();
    if (layer.help) setHelpShown(false);
  }

  /** Hide the menu without resuming (Exit to the start screen). */
  function hideMenu(): void {
    open = false;
    for (const layer of layers.splice(0)) dropLayer(layer);
    menu.hidden = false;
    scrim.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    setHelpShown(false);
    disarm();
  }

  function focusItem(name?: string): void {
    const b = name ? byId.get(name) : undefined;
    (shown(b ?? null) ? b! : resume).focus({ preventScroll: true });
  }

  function openMenu(opts?: { focus?: string }): void {
    if (open) {
      if (!layers.length) focusItem(opts?.focus);
      return;
    }
    open = true;
    paused = !options.live?.();
    title.textContent = paused ? kt('kit.pause.title') : kt('kit.pause.live');
    resume.textContent = paused ? kt('kit.pause.resume') : kt('kit.pause.back');
    (options.items ?? []).forEach((item, i) => (own[i].hidden = item.visible ? !item.visible() : false));
    options.releaseKeys?.();
    if (paused) options.onPause();
    error.hidden = true;
    disarm();
    scrim.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    focusItem(opts?.focus);
  }

  function closeMenu(): void {
    if (!open || busy) return;
    hideMenu();
    guardPointers();
    if (paused) options.onResume();
    if (!bar.hidden && !disabled) toggle.focus({ preventScroll: true });
  }

  function openPanel(el: HTMLElement, opts: { title: string }): () => void {
    const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const opener = selecting ?? active;
    const ownsMenu = !open;
    if (!open) openMenu();
    const box = document.createElement('div');
    box.className = 'ak-pause-menu ak-pause-layer';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const heading = document.createElement('h2');
    heading.className = 'ak-pause-title';
    heading.id = `ak-pause-layer-${id}-${++layerCount}`;
    heading.textContent = opts.title;
    box.setAttribute('aria-labelledby', heading.id);
    const body = document.createElement('div');
    body.className = 'ak-pause-layer-body';
    body.append(el);
    const back = button('ak-pause-item ak-pause-back', kt('kit.pause.backLayer'));
    box.append(heading, body, back);
    const layer: Layer = { box, el, opener, ownsMenu, help: helpRunning, closed: false };
    back.addEventListener('click', () => closeLayer(layer));
    // The panel's own controls get every key; the paused game behind it hears no presses (keyups still pass).
    box.addEventListener('keydown', (e) => e.stopPropagation());
    top().hidden = true;
    layers.push(layer);
    scrim.append(box);
    if (layer.help) setHelpShown(true);
    (focusables(body)[0] ?? back).focus({ preventScroll: true });
    return () => closeLayer(layer);
  }

  /** Back one layer: the panel and any over it close, and the focus goes back to what opened it. */
  function closeLayer(layer: Layer): void {
    if (layer.closed) return;
    for (const l of layers.splice(layers.indexOf(layer))) dropLayer(l);
    if (layer.ownsMenu) {
      closeMenu();
      if (!open && shown(layer.opener) && bar.contains(layer.opener)) layer.opener.focus({ preventScroll: true });
      return;
    }
    const box = top();
    box.hidden = false;
    const target = shown(layer.opener) && box.contains(layer.opener) ? layer.opener : box === menu ? resume : focusables(box)[0];
    target?.focus({ preventScroll: true });
  }

  function back(): void {
    if (layers.length) closeLayer(layers[layers.length - 1]);
    else closeMenu();
  }

  async function leave(): Promise<void> {
    disarm();
    error.hidden = true;
    setBusy(true);
    try {
      await options.save();
    } catch {
      setBusy(false);
      error.textContent = kt('kit.pause.saveError');
      error.hidden = false;
      exit.focus({ preventScroll: true });
      return;
    }
    if (nav.cameFromArcade()) {
      nav.backToArcade(); // the page is leaving; the menu stays as it is until it goes
      return;
    }
    setBusy(false);
    hideMenu();
    guardPointers();
    bar.hidden = true;
    options.toStart();
  }

  exit.addEventListener('click', () => {
    if (busy) return;
    const now = performance.now();
    if (armedAt < 0) {
      armedAt = now;
      exit.textContent = kt('kit.pause.exitConfirm');
      exit.classList.add('ak-armed');
      return;
    }
    if (now - armedAt < ARM_MS) return; // a double tap is one press
    void leave();
  });
  resume.addEventListener('click', () => closeMenu());
  helpItem?.addEventListener('click', () => {
    if (busy) return;
    disarm();
    showHelp(helpItem);
  });
  toggle.addEventListener('click', () => {
    if (!disabled) openMenu();
  });
  helpButton?.addEventListener('click', () => {
    if (disabled) return;
    const help = layers.find((l) => l.help);
    if (help) closeLayer(help);
    else showHelp(helpButton);
  });
  // keyboard: moving off an armed Exit takes the question back
  list.addEventListener('focusin', (e) => {
    if (e.target !== exit) disarm();
  });

  // ── pressed: shown at once on the press, ringed past the finger ──
  const press = (e: Event) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (b && !b.disabled && (bar.contains(b) || b.classList.contains('ak-pause-item'))) b.setAttribute('data-pressed', '');
  };
  const release = (e: Event) => {
    const b = (e.target as Element | null)?.closest?.('button');
    b?.removeAttribute('data-pressed');
  };
  // a press on the pause button is not a press in the game
  const keepFromGame = (e: Event) => e.stopPropagation();
  for (const root of [bar, scrim]) {
    root.addEventListener('pointerdown', press);
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) root.addEventListener(type, release, true);
  }
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) bar.addEventListener(type, keepFromGame);

  // ── a fresh touch after the menu closes: a finger still down then never reaches the game ──
  // (touch events follow their pointer events, so a finger's touchend comes after its pointerup: touches are
  // guarded until the last finger lifts)
  const down = new Map<number, string>();
  const guarded = new Set<number>();
  let touchGuard = false;
  function guardPointers(): void {
    for (const [p, type] of down) {
      guarded.add(p);
      if (type === 'touch') touchGuard = true;
    }
    down.clear();
  }
  const onPointerDown = (e: PointerEvent) => {
    if (open) down.set(e.pointerId, e.pointerType);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (guarded.has(e.pointerId)) e.stopPropagation();
  };
  const onPointerEnd = (e: PointerEvent) => {
    down.delete(e.pointerId);
    if (guarded.delete(e.pointerId)) e.stopPropagation();
  };
  const onTouchRest = (e: Event) => {
    if (!touchGuard) return;
    e.stopPropagation();
    if (e.type !== 'touchmove' && (e as TouchEvent).touches.length === 0) touchGuard = false;
  };

  // ── keys: Escape and P go back one layer, then resume; in the menu Tab stays in it and the arrows move ──
  const cycle = (list: HTMLElement[], step: number) => {
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    list[at < 0 ? 0 : (at + step + list.length) % list.length].focus();
  };
  const onKeyOpen = (e: KeyboardEvent) => {
    if (!open) return;
    const box = top();
    // a panel the game put over the menu itself (its own help) keeps its own keys
    const other = e.target instanceof Element ? e.target.closest('[role="dialog"],[role="alertdialog"],dialog') : null;
    if (other && other !== box) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;
    if (key === 'Escape' || ((key === 'p' || key === 'P') && !typing(e.target))) {
      e.stopPropagation();
      e.preventDefault();
      if (!e.repeat) back();
      return;
    }
    if (box !== menu) {
      // a panel: Tab stays in it; its own controls keep every other key
      if (key !== 'Tab') return;
      e.stopPropagation();
      e.preventDefault();
      cycle(focusables(box), e.shiftKey ? -1 : 1);
      return;
    }
    e.stopPropagation(); // the paused game hears no key presses; keyups still reach it, so a held key never sticks
    if (!MENU_KEYS.includes(key)) return;
    if (key === 'Tab' || key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault();
      cycle(items.filter((b) => !b.disabled && !b.hidden), key === 'ArrowUp' || (key === 'Tab' && e.shiftKey) ? -1 : 1);
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
    }
  };
  const onKeyPlay = (e: KeyboardEvent) => {
    if (open || bar.hidden || disabled || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
    if (typing(e.target)) return;
    e.preventDefault();
    openMenu();
  };

  // back from the arcade through the browser's back button, with this page kept: Exit is ready again
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted && busy) setBusy(false);
  };

  const listeners: Array<[EventTarget, string, EventListener, boolean]> = [
    [window, 'keydown', onKeyOpen as EventListener, true],
    [window, 'keydown', onKeyPlay as EventListener, false],
    [window, 'pointerdown', onPointerDown as EventListener, true],
    [window, 'pointermove', onPointerMove as EventListener, true],
    [window, 'pointerup', onPointerEnd as EventListener, true],
    [window, 'pointercancel', onPointerEnd as EventListener, true],
    [window, 'touchmove', onTouchRest, true],
    [window, 'touchend', onTouchRest, true],
    [window, 'touchcancel', onTouchRest, true],
    [window, 'pageshow', onPageShow, false],
  ];
  for (const [target, type, fn, capture] of listeners) target.addEventListener(type, fn, capture);

  return {
    open: openMenu,
    close: closeMenu,
    isOpen: () => open,
    panel: openPanel,
    setStatus,
    helpClosed() {
      if (!layers.some((l) => l.help)) setHelpShown(false);
    },
    setVisible(visible) {
      bar.hidden = !visible;
    },
    setDisabled(off) {
      disabled = off;
      toggle.disabled = off;
      if (helpButton) helpButton.disabled = off;
    },
    destroy() {
      for (const [target, type, fn, capture] of listeners) target.removeEventListener(type, fn, capture);
      bar.remove();
      scrim.remove();
      open = false;
    },
  };
}

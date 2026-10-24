import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS, createPauseMenu, type PauseMenu, type PauseMenuOptions, type PauseNav } from './pause';
import { kitWords, resetKitWords, useKitWords } from './words';

let menu: PauseMenu | null = null;
let now = 1000;

function setup(extra: Partial<PauseMenuOptions> = {}, fromArcade = false) {
  const calls: string[] = [];
  const nav: PauseNav = {
    cameFromArcade: vi.fn(() => fromArcade),
    backToArcade: vi.fn(() => void calls.push('backToArcade')),
  };
  const options: PauseMenuOptions = {
    onPause: vi.fn(() => void calls.push('pause')),
    onResume: vi.fn(() => void calls.push('resume')),
    save: vi.fn(async () => void calls.push('save')),
    toStart: vi.fn(() => void calls.push('toStart')),
    ...extra,
  };
  menu = createPauseMenu(options, nav);
  menu.setVisible(true);
  return { calls, nav, options, menu };
}

const q = <T extends Element = HTMLButtonElement>(selector: string) => document.querySelector<T>(selector)!;
const labels = () => [...document.querySelectorAll('.ak-pause-item')].map((b) => b.textContent);
const key = (k: string, target: EventTarget = document.activeElement ?? document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
/** Two presses of Exit, far enough apart to count as two. */
async function exitTwice() {
  q('.ak-pause-exit').click();
  now += ARM_MS + 1;
  q('.ak-pause-exit').click();
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  menu?.destroy();
  menu = null;
  resetKitWords();
  vi.restoreAllMocks();
});

describe('the pause menu', () => {
  it('puts Resume first, the game items next, then Help, and Exit last', () => {
    setup({ help: () => {}, items: [{ label: 'Restart', onSelect: () => {} }, { label: 'Map', onSelect: () => {} }] });
    expect(labels()).toEqual(['Resume', 'Restart', 'Map', 'Help', 'Exit']);
    menu!.destroy();
    setup();
    expect(labels()).toEqual(['Resume', 'Exit']);
  });

  it('shows an item only while its visible() is true, asked on each open', () => {
    let unlocked = false;
    setup({ items: [{ label: 'Map', onSelect: () => {}, visible: () => unlocked }] });
    const shown = () => [...document.querySelectorAll<HTMLButtonElement>('.ak-pause-item')].filter((b) => !b.hidden).map((b) => b.textContent);
    menu!.open();
    expect(shown()).toEqual(['Resume', 'Exit']);
    menu!.close();
    unlocked = true;
    menu!.open();
    expect(shown()).toEqual(['Resume', 'Map', 'Exit']);
  });

  it('keeps a live game running: no onPause or onResume, a "Still playing" title, Exit still there', async () => {
    let live = true;
    const { calls, options } = setup({ live: () => live });
    menu!.open();
    expect(q('.ak-pause-title').textContent).toBe('Still playing');
    expect(labels()).toEqual(['Back to game', 'Exit']);
    menu!.close();
    expect(options.onPause).not.toHaveBeenCalled();
    expect(options.onResume).not.toHaveBeenCalled();
    live = false;
    menu!.open();
    expect(q('.ak-pause-title').textContent).toBe('Paused');
    expect(labels()).toEqual(['Resume', 'Exit']);
    menu!.close();
    expect(calls).toEqual(['pause', 'resume']);
    live = true;
    menu!.open();
    await exitTwice();
    expect(calls).toEqual(['pause', 'resume', 'save', 'toStart']);
  });

  it('opens with onPause, focuses Resume, and gives focus back to the pause button on close', () => {
    const { options } = setup();
    q('.ak-pause-toggle').click();
    expect(menu!.isOpen()).toBe(true);
    expect(options.onPause).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(q('.ak-pause-resume'));
    q('.ak-pause-resume').click();
    expect(menu!.isOpen()).toBe(false);
    expect(options.onResume).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(q('.ak-pause-toggle'));
  });

  it('toggles with Escape and P, not while typing, hidden or disabled', () => {
    setup();
    key('Escape', document.body);
    expect(menu!.isOpen()).toBe(true);
    key('Escape');
    expect(menu!.isOpen()).toBe(false);
    key('p', document.body);
    expect(menu!.isOpen()).toBe(true);
    key('P');
    expect(menu!.isOpen()).toBe(false);

    const input = document.createElement('input');
    document.body.append(input);
    key('p', input);
    expect(menu!.isOpen()).toBe(false);
    input.remove();

    menu!.setDisabled(true);
    key('Escape', document.body);
    expect(menu!.isOpen()).toBe(false);
    menu!.setDisabled(false);
    menu!.setVisible(false);
    key('Escape', document.body);
    expect(menu!.isOpen()).toBe(false);
  });

  it('keeps Tab inside the menu', () => {
    setup({ items: [{ label: 'Restart', onSelect: () => {} }] });
    menu!.open();
    key('Tab');
    expect(document.activeElement?.textContent).toBe('Restart');
    key('Tab');
    expect(document.activeElement?.textContent).toBe('Exit');
    key('Tab');
    expect(document.activeElement?.textContent).toBe('Resume');
  });
});

describe('Exit', () => {
  it('asks once more: the first press only changes the button, a quick second press is the same press', async () => {
    const { options } = setup();
    menu!.open();
    q('.ak-pause-exit').click();
    expect(q('.ak-pause-exit').textContent).toBe('Yes, exit');
    expect(q('.ak-pause-exit').classList.contains('ak-armed')).toBe(true);
    now += ARM_MS - 100;
    q('.ak-pause-exit').click();
    await Promise.resolve();
    expect(options.save).not.toHaveBeenCalled();
  });

  it('saves before it leaves for the start screen, and hides the pause button', async () => {
    const { calls, options } = setup();
    menu!.open();
    await exitTwice();
    expect(calls).toEqual(['pause', 'save', 'toStart']);
    expect(options.onResume).not.toHaveBeenCalled();
    expect(menu!.isOpen()).toBe(false);
    expect(q('.ak-pause-bar').hidden).toBe(true);
  });

  it('goes back to the arcade when the game was opened from there', async () => {
    const { calls, options } = setup({}, true);
    menu!.open();
    await exitTwice();
    expect(calls).toEqual(['pause', 'save', 'backToArcade']);
    expect(options.toStart).not.toHaveBeenCalled();
  });

  it('stays in the menu with the error line when the save fails', async () => {
    for (const save of [vi.fn(() => Promise.reject(new Error('full'))), vi.fn(() => { throw new Error('full'); })]) {
      const { nav, options } = setup({ save }, true);
      menu!.open();
      await exitTwice();
      expect(save).toHaveBeenCalledOnce();
      expect(nav.backToArcade).not.toHaveBeenCalled();
      expect(options.toStart).not.toHaveBeenCalled();
      expect(menu!.isOpen()).toBe(true);
      expect(q('.ak-pause-error').hidden).toBe(false);
      expect(q('.ak-pause-error').textContent).toBe('Not saved. Try again.');
      expect(q('.ak-pause-exit').textContent).toBe('Exit');
      expect(q('.ak-pause-exit').disabled).toBe(false);
      menu!.destroy();
    }
  });

  it('works from the keyboard alone: pause, move to Exit, confirm, leave', async () => {
    const { calls } = setup({}, true);
    key('Escape', document.body);
    key('ArrowUp'); // Resume -> Exit (wraps)
    expect(document.activeElement).toBe(q('.ak-pause-exit'));
    q('.ak-pause-exit').click(); // Enter on a focused button is a click
    now += ARM_MS + 1;
    q('.ak-pause-exit').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(['pause', 'save', 'backToArcade']);
  });

  it('cannot be removed by the game', () => {
    setup({ items: [{ label: 'Exit', onSelect: () => {} }] });
    expect(document.querySelectorAll('.ak-pause-exit').length).toBe(1);
    expect(document.querySelector('.ak-pause-items')!.lastElementChild).toBe(q('.ak-pause-exit'));
  });
});

describe('a fresh touch', () => {
  it('a finger still down when the menu closes never reaches the game', () => {
    setup();
    menu!.open();
    const seen: string[] = [];
    const game = (e: Event) => void seen.push(e.type);
    for (const type of ['pointermove', 'pointerup']) document.addEventListener(type, game);
    // jsdom has no PointerEvent: a MouseEvent with the two fields the kit reads
    const pointer = (type: string, id: number) => document.body.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true }), { pointerId: id, pointerType: 'touch' }));
    pointer('pointerdown', 7);
    key('Escape');
    pointer('pointermove', 7);
    pointer('pointerup', 7);
    pointer('pointerdown', 8);
    pointer('pointerup', 8);
    expect(seen).toEqual(['pointerup']); // only the new finger's
    for (const type of ['pointermove', 'pointerup']) document.removeEventListener(type, game);
  });
});

describe('destroy', () => {
  it('takes the DOM off the page and drops every listener', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { options } = setup();
    const added = add.mock.calls.map(([type, fn, capture]) => [type, fn, capture]);
    expect(added.length).toBeGreaterThan(0);
    menu!.destroy();
    expect(remove.mock.calls.map(([type, fn, capture]) => [type, fn, capture])).toEqual(added);
    expect(document.querySelector('.ak-pause-bar, .ak-pause-scrim')).toBeNull();
    key('Escape', document.body);
    expect(options.onPause).not.toHaveBeenCalled();
    menu = null;
  });
});

describe('the pause words', () => {
  it('are kit words a game can change', () => {
    for (const k of ['kit.pause.pause', 'kit.pause.title', 'kit.pause.live', 'kit.pause.back', 'kit.pause.resume', 'kit.pause.help', 'kit.pause.exit', 'kit.pause.exitConfirm', 'kit.pause.saving', 'kit.pause.saveError']) {
      expect(kitWords).toHaveProperty([k]);
    }
    useKitWords({ 'kit.pause.exit': 'Leave', 'kit.pause.pause': 'Stop' });
    setup({ help: () => {} });
    expect(q('.ak-pause-exit').textContent).toBe('Leave');
    expect(q('.ak-pause-toggle').getAttribute('aria-label')).toBe('Stop');
    expect(q('.ak-pause-help').getAttribute('aria-label')).toBe('Help');
  });
});

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

describe('held keys', () => {
  it('a key held when the menu opens comes up for the game: keyups pass, releaseKeys runs before onPause', () => {
    const calls: string[] = [];
    setup({ releaseKeys: () => void calls.push('release'), onPause: () => void calls.push('pause') });
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => void held.add(e.key);
    const up = (e: KeyboardEvent) => void held.delete(e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const send = (type: string, k: string) => document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
    send('keydown', 'ArrowLeft');
    key('Escape', document.body);
    expect(calls).toEqual(['release', 'pause']);
    send('keydown', 'ArrowLeft'); // the key repeats while held: the menu keeps it
    send('keyup', 'ArrowLeft');
    expect(held.has('ArrowLeft')).toBe(false);
    key('Escape');
    expect(menu!.isOpen()).toBe(false);
    expect(held.has('ArrowLeft')).toBe(false);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  });

  it('keeps only the keydowns it acts on from the game', () => {
    setup();
    menu!.open();
    const seen: string[] = [];
    const game = (e: KeyboardEvent) => void seen.push(e.key);
    window.addEventListener('keydown', game);
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', ' ', 'x']) key(k);
    expect(seen).toEqual(['x']);
    window.removeEventListener('keydown', game);
  });
});

describe('the status line', () => {
  it('shows under the title as status, and changes or goes', () => {
    setup({ status: '3D view stopped' });
    menu!.open();
    const line = q<HTMLElement>('.ak-pause-status');
    expect(line.getAttribute('role')).toBe('status');
    expect(line.previousElementSibling).toBe(q('.ak-pause-title'));
    expect(line.hidden).toBe(false);
    expect(line.textContent).toBe('3D view stopped');
    menu!.setStatus('Saved');
    expect(line.textContent).toBe('Saved');
    menu!.setStatus(null);
    expect(line.hidden).toBe(true);
    menu!.destroy();
    setup();
    expect(q<HTMLElement>('.ak-pause-status').hidden).toBe(true);
  });
});

describe('open({ focus })', () => {
  it('focuses the named item, Help or Exit, and Resume when the name is unknown or hidden', () => {
    let map = false;
    setup({ help: () => {}, items: [{ label: 'Settings', id: 'settings', onSelect: () => {} }, { label: 'Map', id: 'map', onSelect: () => {}, visible: () => map }] });
    menu!.open({ focus: 'settings' });
    expect(document.activeElement?.textContent).toBe('Settings');
    menu!.open({ focus: 'exit' }); // open already: only the focus moves
    expect(document.activeElement).toBe(q('.ak-pause-exit'));
    menu!.close();
    menu!.open({ focus: 'help' });
    expect(document.activeElement).toBe(q('.ak-pause-help-item'));
    menu!.close();
    menu!.open({ focus: 'map' });
    expect(document.activeElement).toBe(q('.ak-pause-resume'));
    menu!.close();
    map = true;
    menu!.open({ focus: 'map' });
    expect(document.activeElement?.textContent).toBe('Map');
  });
});

describe('panels', () => {
  function settingsSetup() {
    const sheet = document.createElement('div');
    sheet.innerHTML = '<button type="button" class="loud">Loud</button><button type="button" class="quiet">Quiet</button>';
    let closeSheet = () => {};
    const ctx = setup({ items: [{ label: 'Settings', id: 'settings', onSelect: () => void (closeSheet = menu!.panel(sheet, { title: 'Settings' })) }] });
    return { ...ctx, sheet, close: () => closeSheet() };
  }
  const settingsItem = () => [...document.querySelectorAll<HTMLButtonElement>('.ak-pause-item')].find((b) => b.textContent === 'Settings')!;

  it('stacks over the menu with a title and Back, and Back gives the focus to the item that opened it', () => {
    const { options, sheet } = settingsSetup();
    menu!.open();
    settingsItem().click();
    const layer = q<HTMLElement>('.ak-pause-layer');
    expect(layer.getAttribute('role')).toBe('dialog');
    expect(layer.querySelector('.ak-pause-title')!.textContent).toBe('Settings');
    expect(layer.contains(sheet)).toBe(true);
    expect(q<HTMLElement>('.ak-pause-menu:not(.ak-pause-layer)').hidden).toBe(true);
    expect(document.activeElement?.textContent).toBe('Loud');
    q('.ak-pause-back').click();
    expect(document.querySelector('.ak-pause-layer')).toBeNull();
    expect(sheet.isConnected).toBe(false);
    expect(document.activeElement).toBe(settingsItem());
    expect(menu!.isOpen()).toBe(true);
    expect(options.onResume).not.toHaveBeenCalled();
  });

  it('Escape walks back one layer at a time, then resumes', () => {
    const { options } = settingsSetup();
    menu!.open();
    settingsItem().click();
    const inner = document.createElement('p');
    inner.textContent = 'More';
    menu!.panel(inner, { title: 'More' });
    expect(document.querySelectorAll('.ak-pause-layer').length).toBe(2);
    key('Escape');
    expect(document.querySelectorAll('.ak-pause-layer').length).toBe(1);
    expect(document.activeElement?.textContent).toBe('Loud');
    key('Escape');
    expect(document.querySelector('.ak-pause-layer')).toBeNull();
    expect(document.activeElement).toBe(settingsItem());
    expect(options.onResume).not.toHaveBeenCalled();
    key('Escape');
    expect(menu!.isOpen()).toBe(false);
    expect(options.onResume).toHaveBeenCalledOnce();
  });

  it('keeps Tab inside a panel and lets its controls have the other keys', () => {
    const { sheet } = settingsSetup();
    menu!.open();
    settingsItem().click();
    key('Tab');
    expect(document.activeElement?.textContent).toBe('Quiet');
    key('Tab');
    expect(document.activeElement).toBe(q('.ak-pause-back'));
    key('Tab');
    expect(document.activeElement?.textContent).toBe('Loud');
    const seen: string[] = [];
    sheet.addEventListener('keydown', (e) => void seen.push(e.key));
    key('ArrowRight');
    expect(seen).toEqual(['ArrowRight']);
  });

  it('closes from its own function, and with the menu', () => {
    const { close, options } = settingsSetup();
    menu!.open();
    settingsItem().click();
    close();
    expect(document.querySelector('.ak-pause-layer')).toBeNull();
    expect(document.activeElement).toBe(settingsItem());
    settingsItem().click();
    menu!.close();
    expect(document.querySelector('.ak-pause-layer')).toBeNull();
    expect(options.onResume).toHaveBeenCalledOnce();
    menu!.open();
    expect(q<HTMLElement>('.ak-pause-menu').hidden).toBe(false);
  });

  it('opened during play, it pauses, and closing it resumes', () => {
    const { options } = setup();
    const note = document.createElement('p');
    const close = menu!.panel(note, { title: 'Note' });
    expect(menu!.isOpen()).toBe(true);
    expect(options.onPause).toHaveBeenCalledOnce();
    close();
    expect(menu!.isOpen()).toBe(false);
    expect(options.onResume).toHaveBeenCalledOnce();
  });
});

describe('the help button', () => {
  it('is expanded while a help panel shows, from "?" or Help, and "?" toggles it', () => {
    const help = document.createElement('p');
    help.textContent = 'Steer with the arrows.';
    const { options } = setup({ help: () => void menu!.panel(help, { title: 'How to play' }) });
    const btn = q('.ak-pause-help');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click(); // in play
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(options.onPause).toHaveBeenCalledOnce();
    btn.click(); // a second press closes it
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(menu!.isOpen()).toBe(false);
    expect(document.activeElement).toBe(btn);
    menu!.open();
    q('.ak-pause-help-item').click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    key('Escape');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(q('.ak-pause-help-item'));
  });

  it('with help of its own, stays expanded until helpClosed()', () => {
    const { options } = setup({ help: vi.fn() });
    const btn = q('.ak-pause-help');
    btn.click();
    expect(options.help).toHaveBeenCalledOnce();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    menu!.helpClosed();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the pause words', () => {
  it('are kit words a game can change', () => {
    for (const k of ['kit.pause.pause', 'kit.pause.title', 'kit.pause.live', 'kit.pause.back', 'kit.pause.resume', 'kit.pause.help', 'kit.pause.exit', 'kit.pause.exitConfirm', 'kit.pause.saving', 'kit.pause.saveError', 'kit.pause.backLayer']) {
      expect(kitWords).toHaveProperty([k]);
    }
    useKitWords({ 'kit.pause.exit': 'Leave', 'kit.pause.pause': 'Stop' });
    setup({ help: () => {} });
    expect(q('.ak-pause-exit').textContent).toBe('Leave');
    expect(q('.ak-pause-toggle').getAttribute('aria-label')).toBe('Stop');
    expect(q('.ak-pause-help').getAttribute('aria-label')).toBe('Help');
  });
});

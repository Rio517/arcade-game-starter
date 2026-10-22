/**
 * Wiring: connects the page, the rules (game/rules.ts), the drawing
 * (game/draw.ts) and the arcade kit.
 *
 * Right now this is only the start page: the title, who is playing, and the
 * Play together button (so a family can check it works before building).
 * When you make the game, replace the start card with it and keep the
 * Play together button working.
 *
 * Play together: the HOST runs the rules and sends the world; GUESTS only send
 * their input and draw what the host sends (see AGENTS.md).
 */

import './style.css';
import manifest from '../public/arcade.json';
import { arcade, type Player, type Room } from './arcade';
import { createWorld, step, type Inputs, type World } from './game/rules';
import { hasWord, kitOverrides, t, type GameKey } from './i18n/t';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const whoButton = $<HTMLButtonElement>('who');
const backButton = $<HTMLButtonElement>('back');
const hereLine = $('here');

// The page holds its English as the first paint; data-t="game.…" is replaced by the catalog's text and
// data-t-label="game.…" sets the aria-label. A key the catalog lacks keeps the page's text (and warns in dev).
function sayPage(attribute: 'data-t' | 'data-t-label'): void {
  for (const node of document.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const key = node.getAttribute(attribute) ?? '';
    if (!hasWord(key)) {
      if (import.meta.env.DEV) console.warn(`index.html: "${key}" is not in src/i18n/messages/en.json; the page keeps its own text`);
      continue;
    }
    if (attribute === 'data-t') node.textContent = t(key as GameKey);
    else node.setAttribute('aria-label', t(key as GameKey));
  }
}
sayPage('data-t');
sayPage('data-t-label');
// The kit's own words come with the kit; this hands it any `kit.*` entries the catalog holds.
arcade.words.use(kitOverrides);

$('title').textContent = manifest.title;
document.title = manifest.title;

let me: Player = { name: 'Player', colour: '#3d6bd6' };
let world: World = createWorld((Math.random() * 2 ** 32) >>> 0);

/** Run the example rules once, with one empty input per person here. */
function countPeople(ids: string[]): void {
  const inputs: Inputs = Object.fromEntries(ids.map((id) => [id, { dx: 0, dy: 0 }]));
  world = step(world, 0, inputs);
}

function showHere(room: Room | null): void {
  if (!room) {
    hereLine.textContent = '';
    return;
  }
  countPeople(room.people.map((p) => p.id));
  hereLine.textContent = world.here === 1 ? t('game.start.alone') : t('game.start.here', { count: world.here });
}

function onRoom(room: Room | null): void {
  whoButton.disabled = room !== null;
  whoButton.title = room ? t('game.start.leaveFirst') : '';
  showHere(room);
  if (room) room.onPeople(() => showHere(room));
}

function showWho(): void {
  const playing = t('game.start.playingAs', { name: me.name });
  whoButton.textContent = playing;
  whoButton.setAttribute('aria-label', t('game.start.playingAsChange', { playing }));
}

async function start(): Promise<void> {
  me = await arcade.ui.ensurePlayer(document.body);
  showWho();
  whoButton.addEventListener('click', () => {
    void arcade.ui.playerPicker(document.body).then((p) => {
      me = p;
      showWho();
    });
  });

  if (arcade.cameFromArcade()) {
    backButton.hidden = false;
    backButton.addEventListener('click', () => arcade.backToArcade());
  }

  arcade.ui.togetherPanel($('together-slot')).onRoom(onRoom);
}

void start();

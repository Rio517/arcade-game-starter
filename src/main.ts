/**
 * Wiring: connects the page, the rules (game/rules.ts), the drawing
 * (game/draw.ts) and the arcade kit.
 *
 * Right now this is only the start page: the title, who is playing, and the
 * Play together button (so a family can check it works before building), and
 * an empty playfield with a Play button. In play, the kit's pause button sits
 * top right; its menu always ends in Exit. When you make the game, replace the
 * start card with it, keep the Play together button working, and keep the
 * pause menu for play.
 *
 * Play together: the HOST runs the rules and sends the world; GUESTS only send
 * their input and draw what the host sends (see AGENTS.md).
 */

import './style.css';
import manifest from '../public/arcade.json';
import { arcade, DEFAULT_PLAYER, type Player, type Room } from './arcade';
import { createWorld, step, type Inputs, type World } from './game/rules';
import { kitOverrides, t } from './i18n/t';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const whoButton = $<HTMLButtonElement>('who');
const backButton = $<HTMLButtonElement>('back');
const hereLine = $('here');
const playButton = $<HTMLButtonElement>('play');

// The kit's own words come with the kit; this hands it any `kit.*` entries the catalog holds.
arcade.words.use(kitOverrides);

$('title').textContent = manifest.title;
document.title = manifest.title;

let me: Player = { ...DEFAULT_PLAYER };
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

// In play: the kit's pause button, top right. Its menu is Resume, your items, Help, then Exit, which saves
// and goes back to the arcade (opened from there) or to this start page.
const pause = arcade.ui.pauseMenu({
  onPause: () => document.body.classList.add('paused'), // stop your game loop here
  onResume: () => document.body.classList.remove('paused'), // and start it again here
  save: () => {}, // save progress here with arcade.save(…); Exit waits for it
  toStart: showStart,
  // help: showHelp,  // adds a help button beside pause and Help in the menu
  // items: [{ label: restartWord, onSelect: () => { restart(); pause.close(); } }],  // your own, between Resume and Help
});

function play(): void {
  document.body.classList.add('playing');
  pause.setVisible(true);
}

/** Back on the start page (Exit, when the game was not opened from the arcade). The kit has hidden the pause button. */
function showStart(): void {
  document.body.classList.remove('playing', 'paused');
  playButton.focus();
}

playButton.addEventListener('click', play);
// Switching to another tab or app pauses the game.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && document.body.classList.contains('playing')) pause.open();
});

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

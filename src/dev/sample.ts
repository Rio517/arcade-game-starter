import { draw } from '../game/draw';
import { createWorld } from '../game/rules';

/** A sample look-and-tune page: the game's own draw() on a fixed world. Copy it for a new page. */
const canvas = document.getElementById('view') as HTMLCanvasElement | null;
const ctx = canvas?.getContext('2d');
if (ctx) draw(ctx, createWorld(1));

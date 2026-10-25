// The dev tools server's plugin (`npm run tools`, mode "tools"): dev.html as the root page, and the notes
// overlay on every page. Dev server only (apply: 'serve'), so none of it reaches `npm run build`.
// Notes use the studio's mockup-shelf code, copied in tools/notes/: same store, same `npm run notes -- wait`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNotesHandler } from './notes/notes-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const NOTES_DIR = path.resolve(here, '../docs/mockups');

/** Hosts behind `tailscale serve` (https://<mac>.<tailnet>.ts.net). */
export const isTailnetHost = (host) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d+)?$/.test(host);

export function devTools() {
  return {
    name: 'dev-tools',
    apply: 'serve',
    configureServer(server) {
      const notes = createNotesHandler({
        shelf: NOTES_DIR,
        clientFile: path.join(here, 'notes/notes.js'),
        getPort: () => server.httpServer?.address()?.port ?? 0,
        extraHost: isTailnetHost,
      });
      server.middlewares.use(notes);
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) req.url = `/dev.html${req.url.slice(1)}`;
        next();
      });
    },
    transformIndexHtml: () => [{ tag: 'script', attrs: { src: '/__notes/notes.js', defer: true }, injectTo: 'body' }],
  };
}

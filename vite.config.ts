import { defineConfig } from 'vitest/config';
import { firstPaint } from './src/i18n/firstPaint';

// The page's words are read from disk on every page transform, so editing src/i18n/messages/en.json
// never restarts the dev server (a restart would drop a Play together room). Node's fs is loaded this way
// because the project carries no Node type definitions.
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL, encoding: 'utf8'): string };
const catalog = new URL('./src/i18n/messages/en.json', import.meta.url);

// base './' makes the build work from any GitHub Pages path
// (https://<user>.github.io/<repo>/), so you never have to edit it.
export default defineConfig({
  base: './',
  // safari15: an iPad on iPadOS 15 still runs the game.
  build: { target: 'safari15' },
  plugins: [{ name: 'first-paint', transformIndexHtml: (html) => firstPaint(html, JSON.parse(readFileSync(catalog, 'utf8').replace(/^\uFEFF/, ''))) }],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/testSetup.ts'],
  },
});

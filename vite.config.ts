import { defineConfig } from 'vitest/config';
import { firstPaint } from './src/i18n/firstPaint';
import messages from './src/i18n/messages/en.json';

// base './' makes the build work from any GitHub Pages path
// (https://<user>.github.io/<repo>/), so you never have to edit it.
export default defineConfig({
  base: './',
  // safari15: an iPad on iPadOS 15 still runs the game.
  build: { target: 'safari15' },
  // The page's words come from src/i18n/messages/en.json (see src/i18n/firstPaint.ts).
  plugins: [{ name: 'first-paint', transformIndexHtml: (html) => firstPaint(html, messages) }],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/testSetup.ts'],
  },
});

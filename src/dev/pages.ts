/**
 * Every look-and-tune page this game has, by group. The dev tools page (dev.html,
 * `npm run tools`) lists them in this order. A new page at the repo root
 * (`preview-<thing>.html`) gets a line here; scripts/dev-pages.test.mjs fails while
 * a root `*.html` page is missing. Names are one to four words, the thing itself.
 * Dev only: nothing in the game imports this file.
 */
export interface DevPage {
  name: string;
  href: string;
}

export interface DevGroup {
  group: string;
  pages: readonly DevPage[];
}

export const DEV_PAGES: readonly DevGroup[] = [
  { group: 'Game', pages: [{ name: 'Game', href: '/index.html' }] },
  { group: 'Looks', pages: [{ name: 'Sample page', href: '/preview-sample.html' }] },
];

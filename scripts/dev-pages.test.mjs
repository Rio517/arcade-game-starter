import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_PAGES } from '../src/dev/pages.ts';

const ROOT = resolve(import.meta.dirname, '..');
/** The dev tools page itself is the only root page that is not listed. */
const NOT_LISTED = new Set(['dev.html']);

describe('the dev tools list', () => {
  const pages = DEV_PAGES.flatMap((g) => g.pages);
  const hrefs = pages.map((p) => p.href);
  // A link may carry a query (a start flag such as /?level=3): the page is the part before `?`.
  const files = hrefs.map((h) => h.split('?')[0]);

  it('lists every page at the root', () => {
    const roots = readdirSync(ROOT).filter((f) => f.endsWith('.html') && !NOT_LISTED.has(f));
    expect(roots.filter((f) => !files.includes(`/${f}`) && !(f === 'index.html' && files.includes('/')))).toEqual([]);
  });

  it('links only to pages that exist, each once', () => {
    expect(files.filter((f) => !existsSync(resolve(ROOT, f === '/' ? 'index.html' : f.slice(1))))).toEqual([]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('names each page in one to four words', () => {
    expect(pages.filter((p) => p.name.split(/\s+/).length > 4).map((p) => p.name)).toEqual([]);
  });
});

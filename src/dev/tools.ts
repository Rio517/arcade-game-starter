import { DEV_PAGES } from './pages';

/** The dev tools page: every group in src/dev/pages.ts, a link per page. */
const root = document.getElementById('root');
if (root) {
  const h1 = document.createElement('h1');
  h1.textContent = 'Dev tools';
  root.append(h1);
  for (const group of DEV_PAGES) {
    const h2 = document.createElement('h2');
    h2.textContent = group.group;
    const list = document.createElement('ul');
    for (const page of group.pages) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = page.href;
      a.textContent = page.name;
      li.append(a);
      list.append(li);
    }
    root.append(h2, list);
  }
}

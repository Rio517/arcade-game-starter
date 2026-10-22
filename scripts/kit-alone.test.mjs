// The kit needs nothing from the game: a game that copies src/arcade and nothing else must still type-check.
// This copies the kit (and public/arcade.json, which index.ts reads) into a scratch folder and runs tsc there.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

it('type-checks when src/arcade is copied alone', { timeout: 120_000 }, () => {
  const cache = path.join(root, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(path.join(cache, 'kit-alone-'));
  try {
    mkdirSync(path.join(dir, 'public'));
    cpSync(path.join(root, 'public/arcade.json'), path.join(dir, 'public/arcade.json'));
    mkdirSync(path.join(dir, 'src/arcade'), { recursive: true });
    for (const file of readdirSync(path.join(root, 'src/arcade'))) {
      if (file.endsWith('.ts') && !file.endsWith('.test.ts')) cpSync(path.join(root, 'src/arcade', file), path.join(dir, 'src/arcade', file));
    }
    writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ extends: path.join(root, 'tsconfig.json'), include: ['src'] }));
    const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
    const result = spawnSync(process.execPath, [tsc, '-p', dir, '--noEmit'], { encoding: 'utf8' });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

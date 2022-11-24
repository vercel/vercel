/// <reference types="@types/node" />

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const test = process.platform === 'win32' ? it.skip : it;

test('docs are up to date', async () => {
  const cwd = path.resolve(__dirname, '../');
  await execAsync(`yarn build:docs`, { cwd });
  const result = await execAsync(`git status --short docs`, {
    cwd,
    encoding: 'utf-8',
  });

  const lines = result.stdout
    .trim()
    .split(/(?:\r?\n)+/)
    .map(x => x.trim().split(/\s+/).slice(1).join(' '))
    .filter(x => x.startsWith('docs/'))
    .map(x => `* ${x}`)
    .join('\n')
    .trim();

  if (lines !== '') {
    const diff = await execAsync(`git diff docs`, { cwd, encoding: 'utf8' });
    throw new Error(
      'Docs are not up to date. Please re-run `yarn build:docs` to re-generate them.\nChanges:\n' +
        lines +
        '\n\n' +
        diff.stdout
    );
  }

  expect(result.stdout.trim()).toEqual('');
}, 120000);

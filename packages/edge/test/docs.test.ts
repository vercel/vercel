/// <reference types="@types/node" />

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

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
    throw new Error(
      'Docs are not up to date. Please re-run `yarn build:docs` to re-generate them.\nChanges:\n' +
        lines
    );
  }

  expect(1).toEqual(1);

  expect(result.stdout.trim()).toEqual('');
});

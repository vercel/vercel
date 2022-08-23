/// <reference types="@types/node" />

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

test('docs are up to date', async () => {
  const cwd = path.resolve(__dirname, '../');
  await execAsync(`yarn build:docs`, { cwd });
  const result = await execAsync(`git diff --name-only docs`, {
    cwd,
    encoding: 'utf-8',
  });

  if (result.stdout.trim() !== '') {
    throw new Error(
      'Docs are not up to date. Please re-run `yarn build:docs` to re-generate them. Diff:\n' +
        result.stdout
    );
  }

  expect(1).toEqual(1);

  expect(result.stdout.trim()).toEqual('');
});

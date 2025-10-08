import { expect, test } from 'vitest';
import $ from 'tinyspawn';
import path from 'path';

(process.platform === 'win32' ? test.skip : test)(
  'docs are up to date',
  async () => {
    const cwd = path.resolve(__dirname, '../');
    await $('pnpm build:docs', { cwd });
    const { stdout } = await $(`git status --short docs`);

    const lines = stdout
      .trim()
      .split(/(?:\r?\n)+/)
      .map(x => x.trim().split(/\s+/).slice(1).join(' '))
      .filter(x => x.startsWith('docs/'))
      .map(x => `* ${x}`)
      .join('\n')
      .trim();

    if (lines !== '') {
      const { stdout } = await $('git diff docs', { cwd });
      throw new Error(
        `Docs are not up to date. Please re-run \`pnpm build:docs\` to re-generate them.\nChanges:\n${lines}\n\n${stdout}`
      );
    }

    expect(stdout.trim()).toEqual('');
  }
);

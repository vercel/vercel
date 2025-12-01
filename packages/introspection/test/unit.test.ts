import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { readdir } from 'fs/promises';
import { introspectApp } from '../dist/index.mjs';
import execa from 'execa';

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    fixtureName => fixtureName.includes('')
  );
  for (const fixtureName of fixtures) {
    it(`builds ${fixtureName}`, async () => {
      const dir = join(__dirname, 'fixtures', fixtureName);
      await execa('npm', ['install'], {
        cwd: dir,
      });
      const files = await readdir(dir);
      const handler = files.find(file => file.includes('index'));
      if (!handler) {
        throw new Error(`Handler not found in ${dir}`);
      }

      const result = await introspectApp({
        dir,
        handler,
        env: {},
      });
      expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
        `${dir}/routes.json`
      );
    });
  }
});

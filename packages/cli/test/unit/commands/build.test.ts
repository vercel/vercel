import ms from 'ms';
import fs from 'fs-extra';
import { join } from 'path';
import { client } from '../../mocks/client';
import build from '../../../src/commands/build';

jest.setTimeout(ms('1 minute'));

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/build', name);

describe('build', () => {
  const originalCwd = process.cwd();

  it('should build fully static site', async () => {
    const cwd = fixture('static');
    console.log({ cwd });
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      await build(client);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/static',
            apiVersion: 2,
            src: '**',
            use: '@vercel/static',
          },
        ],
      });

      // "static" directory contains static files
      const files = await fs.readdir(join(output, 'static'));
      expect(files.sort()).toEqual(['index.html']);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

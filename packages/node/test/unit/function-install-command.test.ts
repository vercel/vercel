import { describe, expect, test } from 'vitest';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import type { BuilderFunctions, Meta } from '@vercel/build-utils';
import { build } from '../../src';
import { prepareFilesystem } from './test-utils';

const recordInstall = 'node record-install.cjs';

async function prepareProject() {
  return prepareFilesystem({
    'package.json': JSON.stringify({ name: 'app' }),
    'record-install.cjs': `require('fs').appendFileSync('install.log', 'installed\\n');`,
    'slow-install.cjs': `setTimeout(() => require('fs').appendFileSync('install.log', 'installed\\n'), 500);`,
    'fail-install.cjs': 'process.exit(7);',
    'middleware.js': `export default () => new Response('middleware');`,
    'api/a.cjs': `module.exports = (_req, res) => res.end('a');`,
    'api/b.cjs': `module.exports = (_req, res) => res.end('b');`,
  });
}

async function readInstallLog(workPath: string) {
  const logPath = join(workPath, 'install.log');
  if (!existsSync(logPath)) {
    return [];
  }
  return (await fs.readFile(logPath, 'utf8')).trim().split('\n');
}

async function buildEntrypoint(
  filesystem: Awaited<ReturnType<typeof prepareProject>>,
  entrypoint: string,
  functions: BuilderFunctions,
  meta: Meta = { skipDownload: true }
) {
  const [pattern] = Object.keys(functions);
  return build({
    ...filesystem,
    entrypoint,
    config: {
      zeroConfig: true,
      middleware: entrypoint === 'middleware.js',
      functions: { [pattern]: functions[pattern] },
    },
    meta,
  });
}

describe('functions installCommand', () => {
  test('an empty installCommand skips the dependency install', async () => {
    const filesystem = await prepareProject();

    await buildEntrypoint(filesystem, 'middleware.js', {
      'middleware.js': { installCommand: '' },
    });

    expect(existsSync(join(filesystem.workPath, 'package-lock.json'))).toBe(
      false
    );
    expect(existsSync(join(filesystem.workPath, 'node_modules'))).toBe(false);
  });

  test('runs a non-empty installCommand from the project root instead of the default install', async () => {
    const filesystem = await prepareProject();

    await buildEntrypoint(filesystem, 'api/a.cjs', {
      'api/**': { installCommand: recordInstall },
    });

    expect(await readInstallLog(filesystem.workPath)).toEqual(['installed']);
    expect(existsSync(join(filesystem.workPath, 'api/install.log'))).toBe(
      false
    );
    expect(existsSync(join(filesystem.workPath, 'package-lock.json'))).toBe(
      false
    );
  });

  test('runs the installCommand once across functions sharing a build', async () => {
    const filesystem = await prepareProject();
    const meta: Meta = { skipDownload: true };

    for (const entrypoint of ['api/a.cjs', 'api/b.cjs']) {
      await buildEntrypoint(
        filesystem,
        entrypoint,
        { 'api/**': { installCommand: recordInstall } },
        meta
      );
    }

    expect(await readInstallLog(filesystem.workPath)).toEqual(['installed']);
  });

  test('concurrent functions wait for the shared installCommand to finish', async () => {
    const filesystem = await prepareProject();
    const meta: Meta = { skipDownload: true };

    const logsSeenByEachBuild = await Promise.all(
      ['api/a.cjs', 'api/b.cjs'].map(entrypoint =>
        buildEntrypoint(
          filesystem,
          entrypoint,
          { 'api/**': { installCommand: 'node slow-install.cjs' } },
          meta
        ).then(() => readInstallLog(filesystem.workPath))
      )
    );

    expect(logsSeenByEachBuild).toEqual([['installed'], ['installed']]);
  });

  test('does not run the installCommand in dev', async () => {
    const filesystem = await prepareProject();

    await buildEntrypoint(
      filesystem,
      'api/a.cjs',
      { 'api/**': { installCommand: recordInstall } },
      { skipDownload: true, isDev: true }
    );

    expect(await readInstallLog(filesystem.workPath)).toEqual([]);
  });

  test('propagates a failing installCommand', async () => {
    const filesystem = await prepareProject();

    await expect(
      buildEntrypoint(filesystem, 'api/a.cjs', {
        'api/**': { installCommand: 'node fail-install.cjs' },
      })
    ).rejects.toThrow('exited with 7');
  });
});

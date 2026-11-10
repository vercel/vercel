import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, outputFile, remove, symlink } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { createStaticBuilder } from '../../src/static-builder';
import { glob, type Files } from '@vercel/build-utils';

// `build()` passes file values through untouched, so plain objects are
// sufficient stand-ins for FileFsRef instances.
function makeFiles(names: string[]): Files {
  return Object.fromEntries(
    names.map(name => [name, { type: 'FileFsRef', fsPath: `/project/${name}` }])
  ) as unknown as Files;
}

describe('createStaticBuilder() build', () => {
  const { build } = createStaticBuilder([]);

  test('excludes nested .env files inside outputDirectory', async () => {
    const { output } = await build({
      entrypoint: 'dist/**/*',
      files: makeFiles([
        'dist/index.html',
        'dist/.env',
        'dist/.env.local',
        'dist/.env.production',
      ]),
      config: { zeroConfig: true, outputDirectory: 'dist' },
    } as any);
    expect(Object.keys(output).sort()).toEqual(['index.html']);
  });

  test('excludes nested default-excluded files inside outputDirectory', async () => {
    const { output } = await build({
      entrypoint: 'dist/**/*',
      files: makeFiles([
        'dist/index.html',
        'dist/package.json',
        'dist/.gitignore',
        'dist/vercel.json',
        'dist/.git/config',
        'dist/node_modules/pkg/index.js',
      ]),
      config: { zeroConfig: true, outputDirectory: 'dist' },
    } as any);
    expect(Object.keys(output).sort()).toEqual(['index.html']);
  });

  test('still excludes root-level sensitive files without outputDirectory', async () => {
    const { output } = await build({
      entrypoint: '**/*',
      files: makeFiles(['index.html', '.env', '.env.local', 'vercel.json']),
      config: { zeroConfig: true },
    } as any);
    expect(Object.keys(output).sort()).toEqual(['index.html']);
  });

  test('does not strip prefix from files outside outputDirectory', async () => {
    const { output } = await build({
      files: makeFiles(['dist/index.html', 'other/asset.txt']),
      config: { zeroConfig: true, outputDirectory: 'dist' },
    } as any);
    expect(Object.keys(output).sort()).toEqual([
      'index.html',
      'other/asset.txt',
    ]);
  });

  test('entrypoint matching still applies to the project-relative path', async () => {
    const { output } = await build({
      entrypoint: 'dist/**/*',
      files: makeFiles(['dist/index.html', 'secret.txt']),
      config: { zeroConfig: true, outputDirectory: 'dist' },
    } as any);
    expect(Object.keys(output).sort()).toEqual(['index.html']);
  });
});

describe('static publishing with daemon sources', () => {
  let project: string;
  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'static-daemons-'));
    for (const file of [
      'Dockerfile',
      'index.html',
      'backend/Dockerfile',
      'backend/server.py',
      'public/index.html',
    ]) {
      await outputFile(join(project, file), file);
    }
  });
  afterEach(async () => {
    await remove(project);
  });

  async function run(daemonRoot: string, outputDirectory = '') {
    return createStaticBuilder([]).build({
      entrypoint: outputDirectory ? `${outputDirectory}/**` : '**',
      files: await glob('**', project),
      workPath: project,
      config: { zeroConfig: true, outputDirectory },
      meta: {
        daemonContext: {
          projectRoot: project,
          daemons: {
            worker: {
              root: daemonRoot,
              entrypoint: 'Dockerfile',
              instances: {},
            },
          },
        },
      },
    });
  }

  test('excludes nested daemon files from implicit root publishing', async () => {
    const result = await run('backend');
    expect(Object.keys(result.output)).not.toContain('backend/server.py');
    expect(Object.keys(result.output)).not.toContain('backend/Dockerfile');
    expect(Object.keys(result.output)).toContain('index.html');
  });
  test('rejects outputDirectory equal to the daemon root', async () => {
    await expect(run('backend', 'backend')).rejects.toMatchObject({
      code: 'INVALID_DAEMON_ROOT',
    });
  });
  test('rejects root publishing with a root daemon', async () => {
    await expect(run('.')).rejects.toMatchObject({
      code: 'INVALID_DAEMON_ROOT',
    });
  });
  test('allows public output in a shared context but excludes source symlinks', async () => {
    await symlink(
      join(project, 'backend/server.py'),
      join(project, 'public/server.txt')
    );
    const result = await run('.', 'public');
    expect(Object.keys(result.output)).toEqual(['index.html']);
  });
});

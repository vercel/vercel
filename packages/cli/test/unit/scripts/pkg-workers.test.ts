import { fork } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vercel-pkg-workers-')));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(
    join(root, 'pkg.js'),
    await readFile(new URL('../../../pkg.js', import.meta.url), 'utf8')
  );
  await writeFile(
    join(root, 'native-esbuild.js'),
    await readFile(
      new URL('../../../native-esbuild.js', import.meta.url),
      'utf8'
    )
  );
  await writeFile(
    join(root, 'native-eject.js'),
    await readFile(new URL('../../../native-eject.js', import.meta.url), 'utf8')
  );
  for (const kind of ['build', 'dev']) {
    const directory = join(root, 'dist', 'commands', kind);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'builder-worker.cjs'),
      `process.send({ route: '${kind}', native: process.env.VERCEL_VC_NATIVE });`
    );
  }
  await writeFile(
    join(root, 'dist', 'vc.js'),
    `if (process.argv[2] === '--internal-build-worker') {
      process.send({ route: 'internal-build-worker', argv: process.argv.slice(2) });
    } else {
      process.send({ route: 'cli' });
    }`
  );
  await writeFile(
    join(root, 'dist', 'get-latest-worker.cjs'),
    "process.send({ route: 'update' });"
  );

  const helperDirectory = join(root, 'dist', 'helpers');
  await mkdir(helperDirectory, { recursive: true });
  await writeFile(
    join(helperDirectory, 'generic-worker.mjs'),
    `process.send({
      route: 'generic-esm',
      argv: process.argv.slice(1),
      pkgExecPath: process.env.PKG_EXECPATH ?? null,
    });`
  );
  await writeFile(
    join(helperDirectory, 'generic-worker.cjs'),
    `process.send({ route: 'generic-cjs', argv: process.argv.slice(1) });`
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function runEntrypoint(
  args: string[],
  env: NodeJS.ProcessEnv = process.env
) {
  const child = fork(join(root, 'pkg.js'), args, {
    silent: true,
    execArgv: [],
    env,
  });
  let message: unknown;
  let stderr = '';
  child.stderr!.on('data', data => (stderr += data));
  child.on('message', data => (message = data));
  await new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Entrypoint exited ${code}: ${stderr}`));
    });
  });
  return message;
}

describe('native entrypoint worker dispatch', () => {
  it('routes the internal build worker through the CLI entrypoint', async () => {
    expect(
      await runEntrypoint([
        '--internal-build-worker',
        '--socket',
        '/tmp/vercel-internal-build-worker.sock',
      ])
    ).toEqual({
      route: 'internal-build-worker',
      argv: [
        '--internal-build-worker',
        '--socket',
        '/tmp/vercel-internal-build-worker.sock',
      ],
    });
  });

  it.each(['build', 'dev'])('dispatches the bundled %s worker', async kind => {
    expect(
      await runEntrypoint([
        join(root, 'dist', 'commands', kind, 'builder-worker.cjs'),
      ])
    ).toEqual({ route: kind, native: '1' });
  });

  it('preserves update-check worker dispatch', async () => {
    expect(
      await runEntrypoint([join(root, 'dist', 'get-latest-worker.cjs')])
    ).toEqual({ route: 'update' });
  });

  it.each([
    ['mjs', 'generic-esm'],
    ['cjs', 'generic-cjs'],
  ])('dispatches a generic embedded .%s script', async (extension, route) => {
    const script = join(root, 'dist', 'helpers', `generic-worker.${extension}`);
    expect(await runEntrypoint([script, 'payload'])).toMatchObject({
      route,
      argv: [script, 'payload'],
    });
  });

  it('clears the pkg self-spawn marker before executing a script', async () => {
    const script = join(root, 'dist', 'helpers', 'generic-worker.mjs');
    expect(
      await runEntrypoint([script], {
        ...process.env,
        PKG_EXECPATH: process.execPath,
      })
    ).toMatchObject({ pkgExecPath: null });
  });

  it('does not dispatch a nonexistent snapshot path', async () => {
    expect(await runEntrypoint([join(root, 'builder-worker.cjs')])).toEqual({
      route: 'cli',
    });
  });

  it('does not dispatch an existing script outside the snapshot', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'vercel-pkg-external-'));
    const externalScript = join(externalRoot, 'worker.cjs');
    try {
      await writeFile(externalScript, "process.send({ route: 'external' });");
      expect(await runEntrypoint([externalScript])).toEqual({ route: 'cli' });
    } finally {
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  it('preserves ordinary CLI command dispatch', async () => {
    expect(await runEntrypoint(['build'])).toEqual({ route: 'cli' });
  });

  it('ejects the snapshot instead of starting the CLI', async () => {
    const target = await mkdtemp(join(tmpdir(), 'vercel-pkg-eject-'));
    await mkdir(join(root, 'node_modules'));
    try {
      expect(await runEntrypoint(['--internal-eject', target])).toBeUndefined();
      await expect(
        readFile(join(target, 'dist', 'vc.js'), 'utf8')
      ).resolves.toMatch(/^#!\/usr\/bin\/env node\n/);
      await expect(
        readFile(join(target, 'eject-manifest.json'), 'utf8')
      ).resolves.toContain('"dist/vc.js"');
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('requires exactly one eject directory', async () => {
    await expect(runEntrypoint(['--internal-eject'])).rejects.toThrow(
      /exited 2: Usage: vercel --internal-eject <directory>/
    );
  });
});

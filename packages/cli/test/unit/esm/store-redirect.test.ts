import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

// End-to-end tests for the managed-store redirect in the vc.js entrypoint:
// a fake "installed" CLI at version 1.0.0 and a fake store holding 2.0.0.

async function setupInstalledCli(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vc-store-redirect-'));
  await copyFile('src/vc.js', join(dir, 'vc.js'));
  await copyFile('src/store-redirect.mjs', join(dir, 'store-redirect.mjs'));
  await writeFile(
    join(dir, 'version.mjs'),
    'export const version = "1.0.0";\n'
  );
  // Stand-in for the full CLI (index.js is only reached when not redirecting
  // and not using a --version/--help fast path).
  await writeFile(
    join(dir, 'index.js'),
    'console.log("ran installed 1.0.0");\n'
  );
  return dir;
}

async function seedStore(
  storeDir: string,
  version: string,
  { entrypointBody }: { entrypointBody?: string } = {}
): Promise<void> {
  const versionDist = join(storeDir, 'versions', 'npm', version, 'dist');
  await mkdir(versionDist, { recursive: true });
  await writeFile(
    join(versionDist, 'vc.js'),
    entrypointBody ??
      `console.log("ran store ${version} redirected=" + (process.env.VERCEL_CLI_STORE_REDIRECTED === "1"));\n`
  );
  await writeFile(
    join(storeDir, 'current.json'),
    JSON.stringify({ storeFormat: 1, version, type: 'npm' })
  );
}

function runVc(
  dir: string,
  storeDir: string,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  return execFileAsync(process.execPath, [join(dir, 'vc.js'), 'whoami'], {
    env: {
      ...process.env,
      VERCEL_CLI_STORE: '1',
      VERCEL_CLI_STORE_DIR: storeDir,
      ...extraEnv,
    },
  });
}

describe('vc.js managed store redirect', () => {
  it('redirects to a newer store version with the loop guard set', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await runVc(dir, storeDir);
    expect(stdout.trim()).toBe('ran store 2.0.0 redirected=true');
  });

  it('runs the installed version when the store is older', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '0.5.0');

    const { stdout } = await runVc(dir, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('runs the installed version when there is no store', async () => {
    const dir = await setupInstalledCli();
    const { stdout } = await runVc(dir, join(dir, 'missing-store'));
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('runs the installed version when the flag is not enabled', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await execFileAsync(
      process.execPath,
      [join(dir, 'vc.js'), 'whoami'],
      {
        env: {
          ...process.env,
          VERCEL_CLI_STORE_DIR: storeDir,
          VERCEL_CLI_STORE: undefined,
        },
      }
    );
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('does not redirect for native binary installs', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await runVc(dir, storeDir, { VERCEL_VC_NATIVE: '1' });
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('falls through when the pointed version payload is missing', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await mkdir(storeDir, { recursive: true });
    // Pointer names a version that has no files on disk.
    await writeFile(
      join(storeDir, 'current.json'),
      JSON.stringify({ storeFormat: 1, version: '2.0.0', type: 'npm' })
    );

    const { stdout } = await runVc(dir, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('falls through on an unknown store format', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0');
    await writeFile(
      join(storeDir, 'current.json'),
      JSON.stringify({ storeFormat: 999, version: '2.0.0', type: 'npm' })
    );

    const { stdout } = await runVc(dir, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('propagates the store version exit code', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(42);\n',
    });

    await expect(runVc(dir, storeDir)).rejects.toMatchObject({ code: 42 });
  });

  it('prints a damaged-store hint when the store version dies immediately', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    // Simulates a store version with a broken dist (e.g. mangled
    // node_modules): exits instantly with a non-0, non-1 code.
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(7);\n',
    });

    const err = await runVc(dir, storeDir).catch(e => e);
    expect(err.code).toBe(7);
    expect(err.stderr).toContain('may be damaged');
    expect(err.stderr).toContain('VERCEL_CLI_STORE=0');
  });

  it('does not print the hint for normal CLI failures (exit code 1)', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(1);\n',
    });

    const err = await runVc(dir, storeDir).catch(e => e);
    expect(err.code).toBe(1);
    expect(err.stderr ?? '').not.toContain('may be damaged');
  });

  it('does not print the hint for usage errors (exit code 2)', async () => {
    const dir = await setupInstalledCli();
    const storeDir = join(dir, 'store');
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(2);\n',
    });

    const err = await runVc(dir, storeDir).catch(e => e);
    expect(err.code).toBe(2);
    expect(err.stderr ?? '').not.toContain('may be damaged');
  });
});

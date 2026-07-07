import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

// End-to-end tests for the managed-store redirect in the vc.js entrypoint:
// a fake "installed" CLI at version 1.0.0 and a fake store holding 2.0.0.
//
// Only known-global installs participate, so the default fixture is
// pnpm-global-shaped (under a dir runVc exposes as PNPM_HOME). Pass
// `projectShaped` for a project-dependency fixture instead.

async function setupInstalledCli({
  projectShaped = false,
}: {
  projectShaped?: boolean;
} = {}): Promise<{
  root: string;
  dist: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'vc-store-redirect-'));
  const base = projectShaped
    ? join(root, 'my-app')
    : join(root, 'pnpm-home', 'global', 'hash');
  const dist = join(base, 'node_modules', 'vercel', 'dist');
  await mkdir(dist, { recursive: true });
  if (projectShaped) {
    await writeFile(join(base, 'package-lock.json'), '{}');
  }
  await copyFile('src/vc.js', join(dist, 'vc.js'));
  await copyFile('src/store-redirect.mjs', join(dist, 'store-redirect.mjs'));
  await writeFile(
    join(dist, 'version.mjs'),
    'export const version = "1.0.0";\n'
  );
  // Stand-in for the full CLI (index.js is only reached when not redirecting
  // and not using a --version/--help fast path).
  await writeFile(
    join(dist, 'index.js'),
    'console.log("ran installed 1.0.0");\n'
  );
  return { root, dist };
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
  dist: string,
  storeDir: string,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  // Global-shaped fixtures live under a 'pnpm-home' segment; expose it as
  // PNPM_HOME. Project fixtures don't contain it, so PNPM_HOME stays unset.
  const marker = `${sep}pnpm-home${sep}`;
  const idx = dist.indexOf(marker);
  const pnpmHome =
    idx === -1 ? undefined : dist.slice(0, idx + marker.length - 1);
  return execFileAsync(process.execPath, [join(dist, 'vc.js'), 'whoami'], {
    env: {
      ...process.env,
      VERCEL_CLI_STORE: '1',
      VERCEL_CLI_STORE_DIR: storeDir,
      PNPM_HOME: pnpmHome,
      ...extraEnv,
    },
  });
}

describe('vc.js managed store redirect', () => {
  it('redirects to a newer store version with the loop guard set', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran store 2.0.0 redirected=true');
  });

  it('runs the installed version when the store is older', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '0.5.0');

    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('runs the installed version when there is no store', async () => {
    const { root, dist } = await setupInstalledCli();
    const { stdout } = await runVc(dist, join(root, 'missing-store'));
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('redirects without the env var when the store exists (enrolled machine)', async () => {
    // The store's existence is the enrollment signal — created only by the
    // explicit `vc upgrade --experimental` act.
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await execFileAsync(
      process.execPath,
      [join(dist, 'vc.js'), 'whoami'],
      {
        env: {
          ...process.env,
          VERCEL_CLI_STORE_DIR: storeDir,
          VERCEL_CLI_STORE: undefined,
          PNPM_HOME: join(root, 'pnpm-home'),
        },
      }
    );
    expect(stdout.trim()).toBe('ran store 2.0.0 redirected=true');
  });

  it('runs the installed version when bypassed with VERCEL_CLI_STORE=0', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await runVc(dist, storeDir, { VERCEL_CLI_STORE: '0' });
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('does not redirect for native binary installs', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await runVc(dist, storeDir, { VERCEL_VC_NATIVE: '1' });
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('falls through when the pointed version payload is missing', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await mkdir(storeDir, { recursive: true });
    // Pointer names a version that has no files on disk.
    await writeFile(
      join(storeDir, 'current.json'),
      JSON.stringify({ storeFormat: 1, version: '2.0.0', type: 'npm' })
    );

    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('falls through on an unknown store format', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');
    await writeFile(
      join(storeDir, 'current.json'),
      JSON.stringify({ storeFormat: 999, version: '2.0.0', type: 'npm' })
    );

    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('propagates the store version exit code', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(42);\n',
    });

    await expect(runVc(dist, storeDir)).rejects.toMatchObject({ code: 42 });
  });

  it('prints a damaged-store hint when the store version dies immediately', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    // Simulates a store version with a broken dist (e.g. mangled
    // node_modules): exits instantly with a non-0, non-1 code.
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(7);\n',
    });

    const err = await runVc(dist, storeDir).catch(e => e);
    expect(err.code).toBe(7);
    expect(err.stderr).toContain('may be damaged');
    expect(err.stderr).toContain('VERCEL_CLI_STORE=0');
  });

  it('does not print the hint for normal CLI failures (exit code 1)', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(1);\n',
    });

    const err = await runVc(dist, storeDir).catch(e => e);
    expect(err.code).toBe(1);
    expect(err.stderr ?? '').not.toContain('may be damaged');
  });

  it('does not print the hint for usage errors (exit code 2)', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0', {
      entrypointBody: 'process.exit(2);\n',
    });

    const err = await runVc(dist, storeDir).catch(e => e);
    expect(err.code).toBe(2);
    expect(err.stderr ?? '').not.toContain('may be damaged');
  });

  it('never redirects a project-shaped install (lockfile above node_modules)', async () => {
    const { root, dist } = await setupInstalledCli({ projectShaped: true });
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');

    // Store is newer, but the install sits under a project lockfile — the
    // lockfile is authoritative and the invoked version must run.
    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  // The native-exec fixtures are POSIX shell scripts, which Windows cannot
  // spawn; the shim's Windows dispatch (bin/vercel.exe) is covered by the
  // missing-binary fall-through test below.
  it.skipIf(process.platform === 'win32')(
    'execs a native payload directly when the pointer type is native',
    async () => {
      const { root, dist } = await setupInstalledCli();
      const storeDir = join(root, 'store');
      // Native payload: an executable script at versions/native/<v>/bin/vercel.
      const binDir = join(storeDir, 'versions', 'native', '2.0.0', 'bin');
      await mkdir(binDir, { recursive: true });
      const binPath = join(binDir, 'vercel');
      await writeFile(binPath, `#!/bin/sh\necho "ran native 2.0.0 args=$@"\n`);
      const { chmod } = await import('node:fs/promises');
      await chmod(binPath, 0o755);
      await writeFile(
        join(storeDir, 'current.json'),
        JSON.stringify({ storeFormat: 1, version: '2.0.0', type: 'native' })
      );

      const { stdout } = await runVc(dist, storeDir);
      expect(stdout.trim()).toBe('ran native 2.0.0 args=whoami');
    }
  );

  it.skipIf(process.platform === 'win32')(
    'a native pointer wins even when the invoked version is newer',
    async () => {
      const { root, dist } = await setupInstalledCli(); // installed = 1.0.0
      const storeDir = join(root, 'store');
      const binDir = join(storeDir, 'versions', 'native', '0.5.0', 'bin');
      await mkdir(binDir, { recursive: true });
      const binPath = join(binDir, 'vercel');
      await writeFile(binPath, `#!/bin/sh\necho "ran native 0.5.0"\n`);
      const { chmod } = await import('node:fs/promises');
      await chmod(binPath, 0o755);
      await writeFile(
        join(storeDir, 'current.json'),
        JSON.stringify({ storeFormat: 1, version: '0.5.0', type: 'native' })
      );

      // The user chose the binary; version comparison does not apply.
      const { stdout } = await runVc(dist, storeDir);
      expect(stdout.trim()).toBe('ran native 0.5.0');
    }
  );

  it('falls through when a native pointer names a missing binary', async () => {
    const { root, dist } = await setupInstalledCli();
    const storeDir = join(root, 'store');
    await mkdir(storeDir, { recursive: true });
    await writeFile(
      join(storeDir, 'current.json'),
      JSON.stringify({ storeFormat: 1, version: '2.0.0', type: 'native' })
    );

    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran installed 1.0.0');
  });

  it('redirects a pnpm global even when its install dir has a lockfile', async () => {
    // pnpm 11 isolated globals carry pnpm-lock.yaml; PNPM_HOME wins.
    const { root, dist } = await setupInstalledCli();
    await writeFile(
      join(dist, '..', '..', '..', 'pnpm-lock.yaml'),
      'lockfileVersion: 9\n'
    );
    const storeDir = join(root, 'store');
    await seedStore(storeDir, '2.0.0');

    const { stdout } = await runVc(dist, storeDir);
    expect(stdout.trim()).toBe('ran store 2.0.0 redirected=true');
  });
});

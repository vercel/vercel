import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  access,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withNativeInstallLock } from '../../../src/util/native-install-layout';

const execFileAsync = promisify(execFile);
const installer = resolve(process.cwd(), '../../api/_scripts/install.sh');
const buildSha = 'a'.repeat(40);
const binary = 'binary';
const binarySha = createHash('sha256').update(binary).digest('hex');

describe.skipIf(process.platform === 'win32')('native curl installer', () => {
  let directory: string;
  let installRoot: string;
  let downloadLog: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vercel-native-installer-'));
    installRoot = join(directory, 'install');
    downloadLog = join(directory, 'downloads.log');
    const fakeBin = join(directory, 'bin');
    await mkdir(fakeBin, { recursive: true });

    const curl = join(fakeBin, 'curl');
    await writeFile(
      curl,
      `#!/bin/sh
output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -w) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
case "$url" in
  */latest)
    if [ -n "\${CURL_DELAY:-}" ]; then
      if ! mkdir "$CURL_GUARD" 2>/dev/null; then printf 'overlap\n' >"$OVERLAP_LOG"; fi
      sleep "$CURL_DELAY"
      rmdir "$CURL_GUARD" 2>/dev/null || true
    fi
    printf '{"version":"60.0.0"}'
    ;;
  */current-sha) printf '${buildSha}' ;;
  *.sha256) printf '${binarySha}  vercel\n' >"$output"; printf '200' ;;
  *.tgz) printf 'tarball\n' >>"$DOWNLOAD_LOG"; : >"$output" ;;
  *) printf 'pr-binary\n' >>"$DOWNLOAD_LOG"; printf '${binary}' >"$output" ;;
esac
`
    );
    await chmod(curl, 0o755);

    const tar = join(fakeBin, 'tar');
    await writeFile(
      tar,
      `#!/bin/sh
destination=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-C" ]; then destination="$2"; shift 2; else shift; fi
done
mkdir -p "$destination/package/bin"
printf '${binary}' >"$destination/package/bin/vercel"
`
    );
    await chmod(tar, 0o755);

    env = {
      ...process.env,
      CURL_GUARD: join(directory, 'curl.guard'),
      DOWNLOAD_LOG: downloadLog,
      HOME: directory,
      OVERLAP_LOG: join(directory, 'overlap.log'),
      PATH: `${join(installRoot, 'bin')}:${fakeBin}:/usr/bin:/bin`,
      SHELL: '/bin/sh',
      VERCEL_INSTALL_DIR: installRoot,
    };
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function runInstaller(...args: string[]) {
    return execFileAsync('bash', [installer, ...args], { env });
  }

  async function seedSlot(
    track: 'production' | 'pr',
    metadata: Record<string, string | number>
  ) {
    const slot = join(installRoot, 'versions', 'tracks', track, 'a');
    await mkdir(slot, { recursive: true });
    await writeFile(join(slot, 'vercel'), binary);
    await chmod(join(slot, 'vercel'), 0o755);
    await writeFile(join(slot, 'metadata.json'), JSON.stringify(metadata));
    await symlink(
      'a',
      join(installRoot, 'versions', 'tracks', track, 'active')
    );
    return slot;
  }

  async function downloads(): Promise<string> {
    return readFile(downloadLog, 'utf8').catch(() => '');
  }

  it('teaches POSIX sh to load PATH without exec bash', async () => {
    env.SHELL = '/bin/bash';
    env.PATH = `${join(directory, 'bin')}:/usr/bin:/bin`;

    const { stdout } = await runInstaller();
    await runInstaller();

    const envFile = join(installRoot, 'env');
    const bashrc = join(directory, '.bashrc');
    const profile = join(directory, '.profile');
    const envContents = await readFile(envFile, 'utf8');
    const bashrcContents = await readFile(bashrc, 'utf8');
    const profileContents = await readFile(profile, 'utf8');

    expect(envContents).toContain(`*":${join(installRoot, 'bin')}:"*) ;;`);
    expect(bashrcContents.match(/# Vercel CLI/g)).toHaveLength(1);
    expect(bashrcContents).toContain(`. "${envFile}"`);
    expect(profileContents.match(/# Vercel CLI/g)).toHaveLength(1);
    expect(profileContents).toContain(`. "${envFile}"`);
    await expect(
      readFile(join(directory, '.bash_profile'), 'utf8')
    ).rejects.toThrow();
    expect(stdout).toContain(`export PATH="${join(installRoot, 'bin')}:$PATH"`);
    expect(stdout).toContain(`. "${envFile}"`);
    expect(stdout).not.toContain('exec bash');
    expect(stdout).not.toContain(`source ${bashrc}`);

    const { stdout: path } = await execFileAsync(
      'sh',
      ['-c', `. "${envFile}"; . "${envFile}"; printf %s "$PATH"`],
      { env }
    );
    expect(
      path.split(':').filter(entry => entry === join(installRoot, 'bin'))
    ).toHaveLength(1);
  });

  it('writes .profile for POSIX sh without creating bashrc', async () => {
    env.SHELL = '/bin/sh';
    env.PATH = `${join(directory, 'bin')}:/usr/bin:/bin`;

    const { stdout } = await runInstaller();
    const envFile = join(installRoot, 'env');

    expect(await readFile(join(directory, '.profile'), 'utf8')).toContain(
      `. "${envFile}"`
    );
    await expect(
      readFile(join(directory, '.bashrc'), 'utf8')
    ).rejects.toThrow();
    expect(stdout).toContain(`export PATH="${join(installRoot, 'bin')}:$PATH"`);
    expect(stdout).toContain(`. "${envFile}"`);
    expect(stdout).not.toContain('exec bash');
  });

  it('puts vc on PATH via ~/.local/bin without exec bash', async () => {
    const localBin = join(directory, '.local', 'bin');
    await mkdir(localBin, { recursive: true });
    env.SHELL = '/bin/sh';
    env.PATH = `${localBin}:${join(directory, 'bin')}:/usr/bin:/bin`;

    const { stdout } = await runInstaller();
    await runInstaller();

    const vc = join(localBin, 'vc');
    const vercel = join(localBin, 'vercel');
    expect(await readlink(vc)).toBe(join(installRoot, 'bin', 'vc'));
    expect(await readlink(vercel)).toBe(join(installRoot, 'bin', 'vercel'));
    expect(
      await readlink(
        join(installRoot, 'versions', 'tracks', 'production', 'active')
      )
    ).toBe('a');

    const { stdout: resolved } = await execFileAsync(
      'sh',
      ['-c', 'command -v vc'],
      { env }
    );
    expect(resolved.trim()).toBe(vc);
    expect(stdout).toContain('Done!');
    expect(stdout).toContain('vercel --version');
    expect(stdout).not.toContain(
      `export PATH="${join(installRoot, 'bin')}:$PATH"`
    );
    expect(stdout).not.toContain('exec bash');
  });

  it('does not replace a regular file already in ~/.local/bin', async () => {
    const localBin = join(directory, '.local', 'bin');
    await mkdir(localBin, { recursive: true });
    await writeFile(join(localBin, 'vc'), 'keep-me');
    env.SHELL = '/bin/sh';
    env.PATH = `${localBin}:${join(directory, 'bin')}:/usr/bin:/bin`;

    await runInstaller();

    expect(await readFile(join(localBin, 'vc'), 'utf8')).toBe('keep-me');
    expect(await readlink(join(localBin, 'vercel'))).toBe(
      join(installRoot, 'bin', 'vercel')
    );
  });

  it('writes login and interactive bash rc files when both exist', async () => {
    const bashrc = join(directory, '.bashrc');
    const bashProfile = join(directory, '.bash_profile');
    const originalProfile = '. "$HOME/.bashrc"\n';
    await writeFile(bashrc, '# interactive bash\n');
    await writeFile(bashProfile, originalProfile);
    env.SHELL = '/bin/bash';
    env.PATH = `${join(directory, 'bin')}:/usr/bin:/bin`;

    const { stdout } = await runInstaller();
    await runInstaller();

    const envFile = join(installRoot, 'env');
    const bashrcContents = await readFile(bashrc, 'utf8');
    const bashProfileContents = await readFile(bashProfile, 'utf8');
    expect(bashProfileContents.startsWith(originalProfile)).toBe(true);
    expect(bashProfileContents).toContain('# Vercel CLI');
    expect(bashProfileContents).toContain(`. "${envFile}"`);
    expect(bashProfileContents.match(/# Vercel CLI/g)).toHaveLength(1);
    expect(bashrcContents).toContain('# Vercel CLI');
    expect(bashrcContents).toContain(`. "${envFile}"`);
    expect(bashrcContents.match(/# Vercel CLI/g)).toHaveLength(1);
    expect(await readFile(join(directory, '.profile'), 'utf8')).toContain(
      `. "${envFile}"`
    );
    expect(stdout).toContain(`export PATH="${join(installRoot, 'bin')}:$PATH"`);
    expect(stdout).toContain(`. "${envFile}"`);
    expect(stdout).not.toContain('exec bash');

    const { stdout: path } = await execFileAsync(
      '/bin/bash',
      ['-c', `. "${envFile}"; . "${envFile}"; printf %s "$PATH"`],
      { env }
    );
    expect(
      path.split(':').filter(entry => entry === join(installRoot, 'bin'))
    ).toHaveLength(1);
  });

  it('prefers existing .bash_profile without creating .bashrc', async () => {
    const bashProfile = join(directory, '.bash_profile');
    await writeFile(bashProfile, '# login bash\n');
    env.SHELL = '/bin/bash';
    env.PATH = `${join(directory, 'bin')}:/usr/bin:/bin`;

    await runInstaller();

    const envFile = join(installRoot, 'env');
    expect(await readFile(bashProfile, 'utf8')).toContain(`. "${envFile}"`);
    await expect(
      readFile(join(directory, '.bashrc'), 'utf8')
    ).rejects.toThrow();
    expect(await readFile(join(directory, '.profile'), 'utf8')).toContain(
      `. "${envFile}"`
    );
  });

  it('waits while the CLI owns the install lock', async () => {
    let releaseCli!: () => void;
    const gate = new Promise<void>(resolveGate => {
      releaseCli = resolveGate;
    });
    let cliLocked = false;
    const cli = withNativeInstallLock(installRoot, async () => {
      cliLocked = true;
      await gate;
    });
    while (!cliLocked)
      await new Promise(resolveWait => setTimeout(resolveWait, 1));

    let installerCompleted = false;
    const shell = runInstaller().then(() => {
      installerCompleted = true;
    });
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
    expect(installerCompleted).toBe(false);

    releaseCli();
    await Promise.all([cli, shell]);
    expect(installerCompleted).toBe(true);
  });

  it('blocks a CLI background update while the shell owns the lock', async () => {
    env.CURL_DELAY = '1';
    const shell = runInstaller();
    const owner = join(installRoot, 'update.lock');
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await access(owner)
          .then(() => true)
          .catch(() => false)
      )
        break;
      await new Promise(resolveWait => setTimeout(resolveWait, 10));
    }
    await expect(access(owner)).resolves.toBeUndefined();

    await expect(
      withNativeInstallLock(installRoot, async () => {}, { wait: false })
    ).rejects.toThrow('Native update already in progress');
    await shell;
  });

  it('times out without stealing an abandoned lock', async () => {
    const lock = join(installRoot, 'update.lock');
    await mkdir(installRoot, { recursive: true });
    await writeFile(
      lock,
      JSON.stringify({
        token: 'abandoned',
        pid: 999999,
        createdAt: Date.now() - 11 * 60 * 1000,
      })
    );
    env._VERCEL_INSTALL_LOCK_TIMEOUT_SECONDS = '1';

    await expect(runInstaller()).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `Timed out waiting for another Vercel CLI update. If no update is running, remove the lock at ${lock} and retry.`
      ),
    });
    await expect(readFile(lock, 'utf8')).resolves.toContain('abandoned');
  });

  it('reuses the active production slot without downloading the tarball', async () => {
    await seedSlot('production', {
      track: 'production',
      slot: 'a',
      version: '60.0.0',
    });

    await runInstaller();

    expect(await downloads()).toBe('');
    expect(
      await readlink(
        join(installRoot, 'versions', 'tracks', 'production', 'active')
      )
    ).toBe('a');
  });

  it('preserves the root-active slot when track activation was interrupted', async () => {
    const active = await seedSlot('production', {
      track: 'production',
      slot: 'a',
      version: '59.0.0',
    });
    const trackDir = join(installRoot, 'versions', 'tracks', 'production');
    const inactive = join(trackDir, 'b');
    await mkdir(inactive);
    await writeFile(join(inactive, 'vercel'), binary);
    await chmod(join(inactive, 'vercel'), 0o755);
    await writeFile(
      join(inactive, 'metadata.json'),
      JSON.stringify({ track: 'production', slot: 'b', version: '58.0.0' })
    );
    await rm(join(trackDir, 'active'));
    await symlink('b', join(trackDir, 'active'));
    await symlink('versions/tracks/production/a', join(installRoot, 'active'));

    await runInstaller();

    expect(
      JSON.parse(await readFile(join(active, 'metadata.json'), 'utf8'))
    ).toMatchObject({ slot: 'a', version: '59.0.0' });
    expect(
      JSON.parse(await readFile(join(inactive, 'metadata.json'), 'utf8'))
    ).toMatchObject({ slot: 'b', version: '60.0.0' });
  });

  it('downloads production when no matching slot exists', async () => {
    const { stdout } = await runInstaller();

    expect(await downloads()).toContain('tarball');
    expect(stdout).toContain('activated Vercel CLI v60.0.0');
    expect(stdout).not.toMatch(/on production\/[ab]/);
  });

  it('reuses a matching PR slot without downloading the binary', async () => {
    const slot = await seedSlot('pr', {
      track: 'pr',
      slot: 'a',
      version: 'pr/123',
      pr: 123,
      buildSha,
    });
    await writeFile(join(slot, 'vercel.sha256'), `${binarySha}\n`);

    await runInstaller('pr/123');

    expect(await downloads()).toBe('');
    expect(
      await readlink(join(installRoot, 'versions', 'tracks', 'pr', 'active'))
    ).toBe('a');
  });

  it('downloads a PR binary when no matching slot exists', async () => {
    const { stdout } = await runInstaller('pr/123');
    expect(stdout).toContain('activated build for PR #123');
    expect(stdout).not.toMatch(/on pr\/[ab]/);

    const active = await readlink(join(installRoot, 'active'));
    expect(active).toMatch(/^versions\/tracks\/pr\/[ab]$/);
    expect(await readFile(join(installRoot, active, 'vercel'), 'utf8')).toBe(
      binary
    );
  });
});

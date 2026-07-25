import type { Span } from '@vercel/build-utils';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  readlinkSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import {
  homedir,
  tmpdir,
  arch as osArch,
  platform as osPlatform,
} from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  debug,
  done,
  readString,
  step,
  withSpan,
  write,
  run,
} from '../../util';
import type { DevOutput } from '../types';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Base dir for the private runtime. Overridable via env for tests/CI.
 *   VERCEL_PRIVATE_PODMAN_ROOT=/tmp/my-root
 *
 * Default:
 *   ~/.vercel/runtimes/podman/
 *     v<version>/  <- self-contained binary layout
 *     current -> v<version>
 *     data/   <- XDG_DATA_HOME
 *     config/ <- XDG_CONFIG_HOME
 *     cache/  <- XDG_CACHE_HOME
 */
export function privateRoot(): string {
  const override = readString(process.env.VERCEL_PRIVATE_PODMAN_ROOT);
  if (override) return resolve(override);
  return join(homedir(), '.vercel', 'runtimes', 'podman');
}

// Single source of version — manifest.ts is authoritative. No cycle:
// manifest.ts does not import from private.ts.
import { PODMAN_VENDOR_VERSION } from './manifest';
export const PRIVATE_PODMAN_VERSION = PODMAN_VENDOR_VERSION;

export function versionedRoot(): string {
  return join(privateRoot(), `v${PRIVATE_PODMAN_VERSION}`);
}

export function currentLink(): string {
  return join(privateRoot(), 'current');
}

export function privateDataDir(): string {
  // tests override root, data/config/cache live beside current/
  return join(privateRoot(), 'data');
}
export function privateConfigDir(): string {
  return join(privateRoot(), 'config');
}
export function privateCacheDir(): string {
  return join(privateRoot(), 'cache');
}

export function privateBin(): string {
  // Resolve symlink so callers always get the real file after ensure.
  // On darwin the binary is inside bin/ folder; on linux same.
  // Try current/ first so GC of old versions can't break `privateBin()` after install.
  const viaCurrentApplescriptSafe = join(currentLink(), 'bin', 'podman');
  if (existsSync(viaCurrentApplescriptSafe)) return viaCurrentApplescriptSafe;
  const viaVersionedApplescriptSafe = join(versionedRoot(), 'bin', 'podman');
  if (existsSync(viaVersionedApplescriptSafe))
    return viaVersionedApplescriptSafe;
  // fallback (older layout / test override writing single binary)
  return join(versionedRoot(), 'podman');
}

export function privateMachineName(): string {
  return 'vercel';
}

export function privateEnv(): NodeJS.ProcessEnv {
  const data = privateDataDir();
  const config = privateConfigDir();
  const cache = privateCacheDir();
  const cfgFile = join(config, 'containers', 'containers.conf');
  return {
    ...process.env,
    XDG_DATA_HOME: data,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    CONTAINERS_CONF: cfgFile,
    // Ensure we don't accidentally talk to user's podman via socket env.
    CONTAINER_HOST: undefined,
    CONTAINER_CONNECTION: undefined,
    // Keep PATH sane; we spawn by absolute bin, but children of podman
    // like conmon/gvproxy are resolved from libexec/ via containers.conf.
  };
}

// ---------------------------------------------------------------------------
// Disk-size helpers — honest about what we add
// ---------------------------------------------------------------------------

function duBytes(root: string): number {
  try {
    if (!existsSync(root)) return 0;
    let total = 0;
    const stack: string[] = [root];
    while (stack.length) {
      const p = stack.pop()!;
      try {
        const st = lstatSync(p);
        if (st.isSymbolicLink()) continue;
        if (st.isFile()) {
          total += st.size;
          continue;
        }
        const kids = readdirSync(p);
        for (const k of kids) stack.push(join(p, k));
      } catch {
        // ignore unreadable / disappearing nodes
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function humanSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Manifest — per-platform asset URLs (vendored via this repo's Vercel deploy)
// ---------------------------------------------------------------------------
// Resolution order:
//  1. VERCEL_PODMAN_ASSET_URL  (+ optional VERCEL_PODMAN_ASSET_SHA256)
//     - for local testing:  VERCEL_PODMAN_ASSET_URL=file:///tmp/…tar.gz pnpm vercel dev
//     - supports file:// — bypasses fetch(), copies directly.
//  2. CDN_MANIFEST from ./manifest.ts — populated by build:podman-tarballs
//     - URLs point at:  <cdnBase>/runtimes/podman/v<ver>/podman-<platform>.tar.gz
//     - cdnBase defaults to https://vercel.com, preview = https://<hash>.vercel.app
//       so each push gets a unique dist (VERCEL_URL). Overridable via
//       VERCEL_PODMAN_CDN_BASE for PR testing.
//  3. undefined → caller surfaces honest install instructions.

export type AssetSpec = { url: string; sha256?: string; type?: 'tgz' | 'zip' };

function assetSpecFromEnv(): AssetSpec | undefined {
  const url = readString(process.env.VERCEL_PODMAN_ASSET_URL);
  if (!url) return undefined;
  const sha256 = readString(process.env.VERCEL_PODMAN_ASSET_SHA256);
  const lower = url.toLowerCase();
  const type: AssetSpec['type'] = lower.endsWith('.zip') ? 'zip' : 'tgz';
  return { url, sha256, type };
}

function cdnManifestFromModule(): Record<string, AssetSpec> {
  try {
    // Keep import lazy + optional so this module still works when manifest.ts
    // hasn't been generated yet (dev machines before first build:podman-tarballs).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CDN_MANIFEST } = require('./manifest') as {
      CDN_MANIFEST: Record<
        string,
        { url: string; sha256: string; type: 'tgz' | 'zip' }
      >;
    };
    // Drop zero-hash placeholders unless explicitly allowed — so we don't silently
    // try to download an unfinished build. Local testing can set
    // VERCEL_PODMAN_ALLOW_INCOMPLETE=1 to exercise placeholder path.
    const allowIncomplete = process.env.VERCEL_PODMAN_ALLOW_INCOMPLETE === '1';
    const out: Record<string, AssetSpec> = {};
    for (const [k, spec] of Object.entries(CDN_MANIFEST ?? {})) {
      if (!spec?.url) continue;
      const isPlaceholder = !spec.sha256 || /^0+$/.test(spec.sha256);
      if (isPlaceholder && !allowIncomplete) continue;
      out[k] = spec;
    }
    return out;
  } catch {
    return {};
  }
}

function currentPlatformKey(): string {
  const plat = osPlatform();
  const a = osArch();
  const archNorm = a === 'arm64' ? 'arm64' : a === 'x64' ? 'amd64' : a;
  if (plat === 'darwin') {
    return `darwin-${archNorm === 'amd64' ? 'amd64' : 'arm64'}`;
  }
  if (plat === 'linux') {
    return `linux-${archNorm === 'amd64' ? 'amd64' : 'arm64'}`;
  }
  return `${plat}-${archNorm}`;
}

export function resolveAssetSpec(): AssetSpec | undefined {
  const envSpec = assetSpecFromEnv();
  if (envSpec) return envSpec;
  const cdn = cdnManifestFromModule();
  const key = currentPlatformKey();
  const fromManifest = cdn[key];
  if (fromManifest) return fromManifest;
  return undefined;
}

export { currentPlatformKey };

// ---------------------------------------------------------------------------
// Fetch + verify + extract
// ---------------------------------------------------------------------------

async function fetchToFile(url: string, destFile: string): Promise<void> {
  // file:// support for local tarball testing:
  //   VERCEL_PODMAN_ASSET_URL=file:///tmp/podman-darwin-arm64.tar.gz vercel dev
  // This lets us test with tarballs without standing up a CDN server, and matches
  // the "each push has a unique dist" flow once tarballs are served from
  // https://<preview>.vercel.app/runtimes/podman/...
  if (url.startsWith('file://')) {
    const { copyFileSync } = await import('node:fs');
    const src = url.slice('file://'.length);
    mkdirSync(dirname(destFile), { recursive: true });
    try {
      copyFileSync(src, destFile);
      return;
    } catch (err) {
      throw new Error(
        `failed to copy podman asset from file URL ${url}: ${(err as Error).message}`
      );
    }
  }

  // Use global fetch (Node >=18). Follow redirects.
  // This is the path used in production: URL points at the Vercel deployment's
  // `public/runtimes/podman/v<version>/podman-<platform>.tar.gz`, which Vercel
  // serves as a stable CDN with edge caching. Preview deploys have unique URLs
  // via VERCEL_URL so PRs can test new tarballs without polluting prod.
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(
      `failed to download podman asset: ${res.status} ${res.statusText} for ${url}`
    );
  }
  mkdirSync(dirname(destFile), { recursive: true });
  const ws = createWriteStream(destFile);
  await pipeline(res.body as any, ws);
}

async function sha256File(filePath: string): Promise<string> {
  const { createHash: ch } = await import('node:crypto');
  const { createReadStream } = await import('node:fs');
  return await new Promise<string>((resolveHash, reject) => {
    const h = ch('sha256');
    const rs = createReadStream(filePath);
    rs.on('data', (d: Uint8Array) => h.update(d));
    rs.on('error', reject);
    rs.on('end', () => resolveHash(h.digest('hex')));
  });
}

function emitLine(out: DevOutput | undefined, line: string) {
  if (out?.onStderr) out.onStderr(Buffer.from(`${line}\n`));
  else write(line);
}

export async function downloadAndExtract(
  spec: AssetSpec,
  destRoot: string,
  out?: DevOutput,
  span?: Span
): Promise<void> {
  return withSpan(
    span,
    'container.private.download',
    { 'asset.url': spec.url },
    async s => {
      mkdirSync(destRoot, { recursive: true });
      const tmpFile = join(
        tmpdir(),
        `vercel-podman-${Date.now()}-${Math.random().toString(36).slice(2)}.dl`
      );
      try {
        emitLine(
          out,
          `  → downloading podman ${PRIVATE_PODMAN_VERSION} runtime…`
        );
        s?.setAttributes({
          'download.url': spec.url,
          'download.dest_root': destRoot,
        });

        await fetchToFile(spec.url, tmpFile);

        if (spec.sha256) {
          emitLine(out, `  → verifying checksum…`);
          const got = await sha256File(tmpFile);
          if (got.toLowerCase() !== spec.sha256.toLowerCase()) {
            throw new Error(
              `checksum mismatch for podman asset: expected ${spec.sha256} got ${got}`
            );
          }
          s?.setAttributes({ 'download.sha256': 'ok' });
          emitLine(out, `  ✓ checksum verified`);
        } else {
          debug(
            `no sha256 supplied for private podman asset, skipping verification (url=${spec.url})`
          );
        }

        emitLine(out, `  → extracting runtime…`);

        if (spec.type === 'zip') {
          // darwin release is typically zip containing bin/podman + helpers
          // Use system unzip if available, fallback to Node unzip via import.
          const { spawn: sp } = await import('node:child_process');
          // Attempt `/usr/bin/unzip -q tmp -d destRoot`
          const unzipOk = await new Promise<boolean>(resolveOk => {
            const child = sp('unzip', ['-q', tmpFile, '-d', destRoot], {
              stdio: ['ignore', 'pipe', 'pipe'],
            });
            let errBuf = '';
            child.stderr?.on('data', (c: Buffer) => {
              errBuf += c.toString();
            });
            child.on('error', () => resolveOk(false));
            child.on('close', code => {
              if (code === 0) resolveOk(true);
              else {
                debug(`unzip failed code=${code} ${errBuf}`);
                resolveOk(false);
              }
            });
          });
          if (!unzipOk) {
            throw new Error(
              `failed to extract podman zip asset (tried /usr/bin/unzip). url=${spec.url}`
            );
          }
        } else {
          // tgz
          const sp = await import('node:child_process');
          const tarBin = process.platform === 'darwin' ? 'tar' : 'tar';
          const ok = await new Promise<boolean>(resolveOk => {
            const child = sp.spawn(
              tarBin,
              ['-xzf', tmpFile, '-C', destRoot, '--strip-components=0'],
              {
                stdio: ['ignore', 'pipe', 'pipe'],
              }
            );
            let errBuf = '';
            child.stderr?.on('data', (c: Buffer) => {
              errBuf += c.toString();
            });
            child.on('error', () => resolveOk(false));
            child.on('close', code => {
              if (code === 0) resolveOk(true);
              else {
                debug(`tar extract failed code=${code} ${errBuf}`);
                resolveOk(false);
              }
            });
          });
          if (!ok) {
            throw new Error(
              `failed to extract podman tgz asset. url=${spec.url}`
            );
          }
        }

        // Ensure binaries executable + strip quarantine (macOS) for private dir
        try {
          // find all files under destRoot/bin and destRoot/libexec*
          const fsDyn = (await import('node:fs')) as typeof import('node:fs');
          const stack = [join(destRoot, 'bin'), join(destRoot, 'libexec')];
          for (const root of stack) {
            if (!existsSync(root)) continue;
            const dirs = [root];
            while (dirs.length) {
              const d = dirs.pop()!;
              let entries: import('node:fs').Dirent[];
              try {
                entries = fsDyn.readdirSync(d, {
                  withFileTypes: true,
                }) as unknown as import('node:fs').Dirent[];
              } catch {
                continue;
              }
              for (const ent of entries) {
                const p = join(d, ent.name);
                if (ent.isDirectory()) dirs.push(p);
                else if (ent.isFile() || ent.isSymbolicLink()) {
                  try {
                    fsDyn.chmodSync(p, 0o755);
                  } catch {}
                }
              }
            }
          }
        } catch {}

        if (process.platform === 'darwin') {
          // Best-effort: strip Gatekeeper quarantine so private bin launches without popups.
          // Safe to ignore failure (we'll surface a clear error if podman --version still fails).
          try {
            await run('xattr', ['-dr', 'com.apple.quarantine', destRoot], {
              quiet: true,
            });
            s?.setAttributes({ 'quarantine.stripped': 'true' });
          } catch (err) {
            debug(`quarantine strip skipped: ${(err as Error).message}`);
          }
        }

        s?.setAttributes({ 'install.ok': 'true' });
      } finally {
        try {
          rmSync(tmpFile, { force: true });
        } catch {}
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Install + ensure
// ---------------------------------------------------------------------------

export interface PrivateInstallResult {
  bin: string;
  versionedRoot: string;
  dataDir: string;
  configDir: string;
  cacheDir: string;
  alreadyInstalled: boolean;
  diskBytesBefore: number;
  diskBytesAfter: number;
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function pointCurrentSymlink(versioned: string) {
  const cur = currentLink();
  ensureDir(dirname(cur));
  // Replace atomically: write symlink + update.
  try {
    const prev = existsSync(cur) ? readlinkSync(cur) : undefined;
    if (prev === versioned) return;
  } catch {}
  try {
    unlinkSync(cur);
  } catch {}
  // Windows doesn't support symlinks well without elevation; fallback to write file marker.
  if (process.platform === 'win32') {
    try {
      writeFileSync(cur, versioned);
    } catch {}
    return;
  }
  try {
    symlinkSync(versioned, cur);
  } catch (err) {
    // Fallback to file marker if symlink fails.
    debug(`symlink current->${versioned} failed: ${(err as Error).message}`);
    try {
      writeFileSync(cur, versioned);
    } catch {}
  }
}

function writeMinimalContainersConf(configDir: string) {
  const dir = join(configDir, 'containers');
  ensureDir(dir);
  const confPath = join(dir, 'containers.conf');
  if (existsSync(confPath)) return;
  // Empty config that's explicitly ours; ensures user's ~/.config/containers/containers.conf
  // is not implicitly merged into our isolated runtime.
  const body = [
    '# managed by vercel private podman runtime — do not edit',
    '# isolated via XDG_CONFIG_HOME + CONTAINERS_CONF env override',
    '',
  ].join('\n');
  try {
    writeFileSync(confPath, body, 'utf8');
  } catch {}
}

function binLooksRunnable(binPath: string): boolean {
  if (!existsSync(binPath)) return false;
  try {
    const st = statSync(binPath);
    if (!st.isFile()) return false;
    // needs exec bit on darwin/linux; on win .exe exists.
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the private podman runtime is installed under ~/.vercel/runtimes/podman.
 * Returns the absolute binary path.
 *
 * Honest output:
 *   → First install states size at download time.
 *   → After install states final on-disk size of private root.
 */
export async function ensurePrivatePodmanInstalled(
  out?: DevOutput,
  span?: Span
): Promise<PrivateInstallResult> {
  return withSpan(
    span,
    'container.private.ensure_installed',
    { 'private.version': PRIVATE_PODMAN_VERSION },
    async s => {
      const vr = versionedRoot();
      const b = privateBin();
      const dataDir = privateDataDir();
      const cfgDir = privateConfigDir();
      const cchDir = privateCacheDir();

      ensureDir(privateRoot());
      ensureDir(dataDir);
      ensureDir(cfgDir);
      ensureDir(cchDir);
      writeMinimalContainersConf(cfgDir);

      const bytesBefore = duBytes(privateRoot());

      if (binLooksRunnable(b)) {
        // Verify runnable (spawns quickly enough for POC).
        try {
          await run(b, ['--version'], {
            quiet: true,
            env: privateEnv(),
          });
          s?.setAttributes({
            'private.already_installed': 'true',
            'private.bin': b,
          });
          pointCurrentSymlink(vr);
          return {
            bin: b,
            versionedRoot: vr,
            dataDir,
            configDir: cfgDir,
            cacheDir: cchDir,
            alreadyInstalled: true,
            diskBytesBefore: bytesBefore,
            diskBytesAfter: bytesBefore,
          };
        } catch (err) {
          debug(
            `existing private bin not runnable, reinstalling: ${(err as Error).message}`
          );
          // fall through to reinstall
        }
      }

      const spec = resolveAssetSpec();

      if (!spec) {
        // POC mode: no CDN yet — give user a clear opt-in path instead of silent failure.
        throw new Error(
          [
            'Private Podman runtime is not yet installed, and no download bundle is configured.',
            '',
            `Expected on-disk binary at ${join(vr, 'bin', 'podman')} (or $VERCEL_PRIVATE_PODMAN_ROOT override).`,
            '',
            'To run containers without requiring Docker/Podman on your PATH, install a private runtime:',
            `  • Place prebuilt podman binaries under ${vr}/bin/`,
            `  • Or set VERCEL_PODMAN_ASSET_URL (+ optional VERCEL_PODMAN_ASSET_SHA256) to a tarball/zip for this platform.`,
            `    Current platform key: ${currentPlatformKey()} (arch=${osArch()})`,
            `    Example with GitHub release assets (requires network):`,
            `      VERCEL_PODMAN_ASSET_URL="https://github.com/containers/podman/releases/download/v${PRIVATE_PODMAN_VERSION}/...your-platform-archive..." \\`,
            '      vercel dev',
            '',
            'This POC vendors the runtime under ~/.vercel/runtimes/podman/ and never touches your system PATH or system Podman.',
          ].join('\n')
        );
      }

      // Honest sizing for user
      emitLine(
        out,
        `▲ containers  installing private podman runtime v${PRIVATE_PODMAN_VERSION} to ${privateRoot()}`
      );
      emitLine(
        out,
        `  → this downloads ~60-120MB + up to ~1GB for the VM image on macOS (stored privately, isolated, no PATH pollution)`
      );

      await downloadAndExtract(spec, vr, out, s);

      // Finalize current->versioned link after extract.
      pointCurrentSymlink(vr);

      // Verify extracted bin works.
      const finalBin = privateBin();
      try {
        await run(finalBin, ['--version'], { quiet: true, env: privateEnv() });
      } catch (err) {
        const detail = (err as Error).message;
        throw new Error(
          [
            `Private podman install completed but \`${finalBin} --version\` failed.`,
            `This often means missing system libs or Gatekeeper quarantine on macOS.`,
            `Try stripping quarantine manually:`,
            `  xattr -dr com.apple.quarantine ${vr}`,
            `Or point VERCEL_PRIVATE_PODMAN_ROOT to a working podman install.`,
            `Underlying error: ${detail}`,
          ].join('\n')
        );
      }

      const bytesAfter = duBytes(privateRoot());
      const added = Math.max(0, bytesAfter - bytesBefore);
      s?.setAttributes({
        'private.bin': finalBin,
        'private.versioned_root': vr,
        'private.disk_bytes_before': String(bytesBefore),
        'private.disk_bytes_after': String(bytesAfter),
      });

      emitLine(
        out,
        `  ✓ runtime ready at ${finalBin} (${humanSize(bytesAfter)} total; +${humanSize(added)} installed)`
      );
      emitLine(
        out,
        `  → isolated env: XDG_DATA_HOME=${dataDir} XDG_CONFIG_HOME=${cfgDir} machine=${privateMachineName()}`
      );

      return {
        bin: finalBin,
        versionedRoot: vr,
        dataDir,
        configDir: cfgDir,
        cacheDir: cchDir,
        alreadyInstalled: false,
        diskBytesBefore: bytesBefore,
        diskBytesAfter: bytesAfter,
      };
    }
  );
}

// ---------------------------------------------------------------------------
// Machine management (macOS only)
// ---------------------------------------------------------------------------

export async function listPrivateMachines(
  out?: DevOutput,
  span?: Span
): Promise<Array<{ Name: string; Running: boolean; Starting?: boolean }>> {
  const bin = privateBin();
  try {
    const { stdout } = await run(bin, ['machine', 'list', '--format', 'json'], {
      quiet: true,
      env: privateEnv(),
    });
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    // podman machine list may return one JSON object per line or a JSON array.
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as any;
      if (parsed && typeof parsed === 'object') return [parsed as any];
    } catch {}
    const lines = trimmed
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const outArr: Array<{
      Name: string;
      Running: boolean;
      Starting?: boolean;
    }> = [];
    for (const line of lines) {
      try {
        outArr.push(JSON.parse(line));
      } catch {}
    }
    return outArr;
  } catch (err) {
    debug(`private machine list failed: ${(err as Error).message}`);
    void out;
    void span;
    return [];
  }
}

export async function isPrivateMachineRunning(
  out?: DevOutput,
  span?: Span
): Promise<boolean> {
  const bin = privateBin();
  try {
    await run(bin, ['info', '--format', '{{.Host.Security.Rootless}}'], {
      quiet: true,
      env: privateEnv(),
    });
    return true;
  } catch {
    // try machine list as secondary signal
    const machines = await listPrivateMachines(out, span);
    return machines.some(
      m => m.Name === privateMachineName() && (m.Running || m.Starting)
    );
  }
}

export async function ensurePrivateMachine(
  out?: DevOutput,
  span?: Span
): Promise<void> {
  if (process.platform === 'win32') {
    // Windows POC unsupported — caller decides how to error.
    throw new Error(
      'Private Podman machine is not supported on Windows in this POC. Install Docker Desktop/Podman manually, or use WSL2 Linux.'
    );
  }
  if (process.platform !== 'darwin') {
    // Linux = daemonless. No machine management needed.
    // Still run `podman info` to surface subuid/gid misconfig.
    const bin = privateBin();
    try {
      await run(bin, ['info'], { quiet: true, env: privateEnv() });
    } catch (err) {
      const msg = (err as Error).message;
      if (/subuid|subgid/i.test(msg)) {
        throw new Error(
          [
            'Podman installed privately but cannot run rootless containers:',
            msg.split('\n').slice(0, 8).join('\n'),
            '',
            'Fix: sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER',
            'Then re-run vercel dev.',
          ].join('\n')
        );
      }
      throw err;
    }
    return;
  }

  // macOS: ensure machine exists and is running.
  return withSpan(span, 'container.private.ensure_machine', {}, async s => {
    const running = await isPrivateMachineRunning(out, s);
    if (running) {
      s?.setAttributes({ 'machine.already_running': 'true' });
      return;
    }

    const bin = privateBin();
    const machines = await listPrivateMachines(out, s);
    const name = privateMachineName();
    const existing = machines.find(m => m.Name === name);

    if (!existing) {
      emitLine(
        out,
        `▲ containers  creating private podman machine "${name}" (AppleHV, rootless, ~2GB disk)`
      );
      emitLine(
        out,
        `  → disk usage is isolated to ${privateDataDir()} and does not affect any system podman/machine install`
      );
      step(`Initializing Podman machine ${name} (rootless, first run)`);

      // Allow overrides for testing: VERCEL_PRIVATE_PODMAN_MACHINE_ARGS
      const extraArgs = (
        readString(process.env.VERCEL_PRIVATE_PODMAN_MACHINE_ARGS) ?? ''
      )
        .split(' ')
        .filter(Boolean);

      const initArgs = [
        'machine',
        'init',
        name,
        '--rootful=false',
        '--cpus',
        '2',
        '--memory',
        '2048',
        '--disk-size',
        '20',
        ...extraArgs,
      ];

      try {
        await run(bin, initArgs, { env: privateEnv() });
      } catch (err) {
        const detail = (err as Error).message;
        throw new Error(
          [
            `Failed to init private podman machine "${name}".`,
            `Command: podman ${initArgs.join(' ')}`,
            `Bin: ${bin}`,
            '',
            `This often means missing AppleHV/qemu support or insufficient disk space.`,
            `Disk: private root is ${privateRoot()} (needs ~2GB free on first run).`,
            '',
            `Details: ${detail}`,
          ].join('\n')
        );
      }
      done(`machine ${name} initialized`);
      s?.setAttributes({ 'machine.inited': 'true' });
    }

    emitLine(
      out,
      `▲ containers  starting private podman machine "${name}" (2-3s)…`
    );
    step(`Starting Podman machine (${name})`);
    try {
      await run(bin, ['machine', 'start', name], { env: privateEnv() });
    } catch (err) {
      const detail = (err as Error).message;
      throw new Error(
        [
          `Private podman machine "${name}" could not be started.`,
          '',
          `Try diagnosing with:`,
          `  ${bin} --log-level=debug machine inspect ${name}`,
          `  ${bin} machine list`,
          `  ${bin} info`,
          '',
          `Common fixes:`,
          `  • Free disk space under ${privateDataDir()} (~1-2GB)`,
          `  • On macOS 13+, AppleHV is default; on older macOS you may need VERCEL_PRIVATE_PODMAN_MACHINE_ARGS="--provider qemu"`,
          `  • Remove partial machine state: ${bin} machine rm -f ${name} && re-run vercel dev`,
          '',
          `Underlying error: ${detail}`,
        ].join('\n')
      );
    }
    done(`machine ${name} ready`);
    s?.setAttributes({ 'machine.started': 'true' });

    // Final probe.
    if (!(await isPrivateMachineRunning(out, s))) {
      throw new Error(
        `Private podman machine "${name}" started but \`podman info\` still cannot connect. ` +
          `Try: \`${bin} machine stop ${name} && ${bin} machine start ${name}\``
      );
    }
  });
}

export async function stopPrivateMachine(
  out?: DevOutput,
  span?: Span
): Promise<void> {
  if (process.platform !== 'darwin') return;
  const bin = privateBin();
  try {
    const machines = await listPrivateMachines(out, span);
    const name = privateMachineName();
    if (!machines.some(m => m.Name === name && (m.Running || m.Starting)))
      return;
    emitLine(out, `▲ containers  stopping private podman machine "${name}"…`);
    await run(bin, ['machine', 'stop', name], {
      quiet: true,
      env: privateEnv(),
    });
    done(`machine ${name} stopped`);
  } catch (err) {
    debug(`stop private machine: ${(err as Error).message}`);
  }
}

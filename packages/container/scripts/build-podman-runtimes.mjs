#!/usr/bin/env node
/**
 * Build vendored Podman runtime tarballs for distribution via this repo's
 * Vercel project (`public/runtimes/podman/`).
 *
 * Model (matches how npm tarballs work in `utils/pack.ts` + `api/_lib/script/build.ts`):
 * - Input: official Podman GitHub release assets (or local brew install for --local)
 * - Output: `packages/container/dist-runtimes/podman-v<ver>-<platform>.tar.gz`
 *           + `manifest.generated.json` with sha256, used by `src/.../manifest.ts`
 * - Publish: `api/_lib/script/build.ts` copies `dist-runtimes/*` into
 *            `public/runtimes/podman/v<ver>/` served as:
 *              https://<preview>.vercel.app/runtimes/podman/v<ver>/podman-darwin-arm64.tar.gz
 *            Prod alias: https://vercel.com/runtimes/podman/v<ver>/…
 *            Each push => unique preview URL, so PRs can test new runtime dists.
 *
 * Usage:
 *   Local dev from brew (fastest iteration, no network fetch of upstream):
 *     pnpm --filter @vercel/container build:podman-tarballs -- --local
 *
 *   From upstream release (CI / canonical build):
 *     pnpm --filter @vercel/container build:podman-tarballs -- --version 5.4.2
 *     # or explicit input:
 *     --from-github           # fetch from github.com/containers/podman/releases/download/v<ver>/
 *
 *   Then test with file:// (no CDN needed yet):
 *     VERCEL_PODMAN_ASSET_URL=file://$PWD/packages/container/dist-runtimes/podman-v5.4.2-darwin-arm64.tar.gz \
 *       pnpm vercel dev --filter=@vercel/container
 *
 *   Or after `vercel deploy` of this repo:
 *     VERCEL_PODMAN_CDN_BASE=https://<preview>.vercel.app \
 *       VERCEL_CONTAINER_ENGINE=podman-private vercel dev
 *
 * The produced tar layout is self-contained and matches what private.ts:downloadAndExtract
 * expects:
 *   bin/podman
 *   libexec/podman/gvproxy
 *   libexec/podman/vfkit            (darwin arm64/amd64; may be vfkit binary)
 *   libexec/podman/conmon, crun, netavark, aardvark-dns, pasta  (linux; platform dependent)
 *   share/containers/containers.conf (optional, minimal defaults)
 *   data/machine/fedora-coreos-<ver>.qcow2  (optional, pre-cached to avoid 2nd download on macOS)
 *
 * Assets larger than 50MB get edge-cached by Vercel; we still emit honest size hints.
 */

import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync,
  lstatSync,
  readlinkSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { tmpdir, platform as osPlatform, arch as osArch } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const distDir = join(pkgRoot, 'dist-runtimes');
const srcManifestPath = join(pkgRoot, 'src/engines/podman/manifest.ts');
const generatedJsonPath = join(
  pkgRoot,
  'src/engines/podman/manifest.generated.json'
);

function parseArgs(argv) {
  const out = {
    local: false,
    fromGithub: false,
    version: undefined,
    platforms: undefined,
    dryRun: false,
    skipQcow2: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local') out.local = true;
    else if (a === '--from-github') out.fromGithub = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-qcow2') out.skipQcow2 = true;
    else if (a === '--version' || a === '-v') out.version = argv[++i];
    else if (a.startsWith('--version='))
      out.version = a.slice('--version='.length);
    else if (a === '--platforms') {
      const v = argv[++i];
      if (!v) throw new Error('--platforms requires a value');
      out.platforms = v
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else if (a.startsWith('--platforms='))
      out.platforms = a
        .slice('--platforms='.length)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    else if (a === '--help' || a === '-h') {
      console.log(`usage: build-podman-runtimes.mjs [--local] [--from-github] [--version 5.4.2]
       [--platforms darwin-arm64,darwin-amd64,linux-amd64,linux-arm64] [--skip-qcow2] [--dry-run]`);
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function readVersionFromManifestTs() {
  try {
    const txt = readFileSync(srcManifestPath, 'utf8');
    const m = txt.match(/PODMAN_VENDOR_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
  } catch {}
  return undefined;
}

const VERSION = args.version ?? readVersionFromManifestTs() ?? '5.4.2';

const ALL_PLATFORMS = [
  'darwin-arm64',
  'darwin-amd64',
  'linux-amd64',
  'linux-arm64',
];
const WANTED = args.platforms?.length ? args.platforms : ALL_PLATFORMS;

// Upstream release asset names (as of podman v5.x)
function upstreamAssetName(platform) {
  // Official assets are podman-remote for CLI-only; installer is .pkg.
  // We need the full (non-remote) binaries. For now we synthesize from the
  // installer layout locally. From-github mode will need to expand the .pkg
  // for darwin (or brew bottle) then repack. For POC we error on --from-github
  // + darwin and advise --local.
  switch (platform) {
    case 'darwin-arm64':
      return `podman-installer-macos-arm64.pkg`;
    case 'darwin-amd64':
      return `podman-installer-macos-amd64.pkg`;
    case 'linux-amd64':
      return `podman-remote-static-linux_amd64.tar.gz`;
    case 'linux-arm64':
      return `podman-remote-static-linux_arm64.tar.gz`;
    default:
      throw new Error(`unknown platform ${platform}`);
  }
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const u = ['KB', 'MB', 'GB'];
  let v = bytes / 1024,
    i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

async function sha256File(p) {
  const h = createHash('sha256');
  // Simple stream hash — don't use pipeline transform, previous generator-yield approach deadlocked on Node 20+ with large files.
  return await new Promise((resolve, reject) => {
    const rs = createReadStream(p);
    rs.on('data', d => h.update(d));
    rs.on('error', reject);
    rs.on('end', () => resolve(h.digest('hex')));
  });
}

function run(cmd, argv, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, argv, { stdio: opts.stdio ?? 'inherit', ...opts });
    child.on('error', reject);
    child.on('close', code =>
      code === 0
        ? resolveP()
        : reject(new Error(`${cmd} ${argv.join(' ')} exited ${code}`))
    );
  });
}

async function fetchToFile(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body)
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  const ws = createWriteStream(dest);
  // @ts-ignore
  await pipeline(res.body, ws);
}

// ---- Local brew -> tarball repack ----

function brewPrefix() {
  // Try `brew --prefix` first — most reliable; falls back to heuristics.
  try {
    const out = execFileSync('brew', ['--prefix'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out && existsSync(out)) return out;
  } catch {}
  try {
    if (existsSync('/opt/homebrew/bin/brew')) {
      const out = execFileSync('/opt/homebrew/bin/brew', ['--prefix'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out && existsSync(out)) return out;
    }
  } catch {}
  try {
    const p = (process.env.HOMEBREW_PREFIX ?? '').trim();
    if (p) return p;
  } catch {}
  // heuristic
  if (existsSync('/opt/homebrew/bin/brew')) return '/opt/homebrew';
  if (existsSync('/usr/local/Homebrew')) return '/usr/local';
  return osArch() === 'arm64' ? '/opt/homebrew' : '/usr/local';
}

async function buildFromLocal(platform) {
  // Only supports mapping current host -> same platform. Cross platforms need --from-github.
  const hostPlat = `${osPlatform()}-${osArch() === 'arm64' ? 'arm64' : 'amd64'}`;
  const hostAlt = `${osPlatform()}-${osArch() === 'x64' ? 'amd64' : 'arm64'}`;
  if (platform !== hostPlat && platform !== hostAlt) {
    // allow if --local requested but cross — skip with message
    console.warn(
      `[build:podman] --local requested for ${platform} but host is ${hostPlat}; skipping (use --from-github for cross).`
    );
    return null;
  }

  const tmp = join(
    tmpdir(),
    `vercel-podman-repack-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const stage = join(tmp, 'stage'); // this becomes tar root
  mkdirSync(join(stage, 'bin'), { recursive: true });
  mkdirSync(join(stage, 'libexec', 'podman'), { recursive: true });

  const pref = brewPrefix();
  const candidates = [
    join(pref, 'opt/podman/bin/podman'),
    join(pref, 'bin/podman'),
    '/opt/homebrew/opt/podman/bin/podman',
    '/opt/homebrew/bin/podman',
    '/opt/podman/bin/podman',
    '/usr/local/bin/podman',
    '/usr/local/opt/podman/bin/podman',
  ];
  let podmanBin = candidates.find(p => existsSync(p));
  if (!podmanBin) {
    // last try: which podman + brew ls
    try {
      const { execFileSync } = await import('node:child_process');
      const which = execFileSync('which', ['podman'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (which && existsSync(which)) podmanBin = which;
    } catch {}
    if (!podmanBin) {
      try {
        const { execFileSync } = await import('node:child_process');
        // `brew --prefix podman` gives the opt symlink target directory
        const brewPodmanPrefix = execFileSync('brew', ['--prefix', 'podman'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const cand = join(brewPodmanPrefix, 'bin/podman');
        if (existsSync(cand)) podmanBin = cand;
      } catch {}
    }
  }
  if (!podmanBin) {
    const msg =
      `podman binary not found (tried ${candidates.join(', ')} plus \`which podman\` and \`brew --prefix podman\`). ` +
      `Install with \`brew install podman\` or re-run without --local to fetch the official installer.`;
    throw new Error(msg);
  }

  console.log(`  using podman bin: ${podmanBin}`);
  copyFileSync(podmanBin, join(stage, 'bin', 'podman'));

  // helpers — best-effort, brew layout varies wildly by version
  const helperSearchRoots = [
    join(pref, 'opt/podman/libexec'),
    join(pref, 'opt/podman/libexec/podman'),
    join(pref, 'libexec/podman'),
    join(pref, 'Cellar/podman'),
    '/opt/homebrew/opt/podman/libexec/podman',
    '/opt/homebrew/libexec/podman',
    '/opt/homebrew/Cellar/podman',
    '/opt/podman/libexec/podman',
    '/usr/local/opt/podman/libexec/podman',
    '/usr/local/libexec/podman',
    '/usr/local/Cellar/podman',
  ];
  const wantedHelpers = platform.startsWith('darwin')
    ? ['gvproxy', 'vfkit', 'qemu', 'krunkit'] // qemu/krunkit optional for older setups
    : ['conmon', 'crun', 'netavark', 'aardvark-dns', 'pasta', 'gvproxy'];

  function deepSearchHelper(root, name, maxDepth = 3) {
    if (!existsSync(root)) return null;
    const stack = [{ dir: root, depth: 0 }];
    while (stack.length) {
      const { dir, depth } = stack.pop();
      if (depth > maxDepth) continue;
      let ents;
      try {
        ents = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of ents) {
        const full = join(dir, e.name);
        if (e.isFile() && e.name === name) return full;
        if (
          e.isDirectory() &&
          !e.name.startsWith('.') &&
          e.name !== 'share' &&
          e.name !== 'include'
        ) {
          // Common nested layout: Cellar/podman/<ver>/libexec/podman/<name>
          stack.push({ dir: full, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  for (const name of wantedHelpers) {
    let found = null;
    for (const root of helperSearchRoots) {
      found = deepSearchHelper(root, name);
      if (found) break;
    }
    // also direct probe: podman binary's sibling dir
    if (!found) {
      try {
        const binDir = dirname(podmanBin);
        const sibling = join(binDir, '..', 'libexec', 'podman', name);
        if (existsSync(sibling)) found = sibling;
        const sibling2 = join(binDir, '..', 'libexec', name);
        if (!found && existsSync(sibling2)) found = sibling2;
      } catch {}
    }
    if (found && existsSync(found)) {
      copyFileSync(found, join(stage, 'libexec', 'podman', name));
      console.log(`  helper ${name} <- ${found}`);
    } else {
      console.warn(
        `  helper ${name} not found (optional on some platforms), skipping`
      );
    }
  }

  // Optional: pre-cache FCOS qcow2 if already fetched under user's private data dir
  if (!args.skipQcow2 && platform.startsWith('darwin')) {
    const cacheCandidates = [
      join(
        process.env.HOME ?? '',
        '.vercel/runtimes/podman/data/containers/podman/machine/applehv'
      ),
      join(
        process.env.HOME ?? '',
        '.local/share/containers/podman/machine/applehv'
      ),
      '/tmp/podman-machine-cache',
    ];
    for (const root of cacheCandidates) {
      if (!existsSync(root)) continue;
      try {
        const files = readdirSync(root).filter(f => f.endsWith('.qcow2'));
        if (files.length) {
          const src = join(root, files[0]);
          const dstDir = join(stage, 'data', 'machine');
          mkdirSync(dstDir, { recursive: true });
          copyFileSync(src, join(dstDir, files[0]));
          console.log(
            `  pre-cached FCOS image ${files[0]} (${human(statSync(src).size)})`
          );
          break;
        }
      } catch {}
    }
  }

  // minimal containers.conf to make helper_bin_dir discovery deterministic
  mkdirSync(join(stage, 'share', 'containers'), { recursive: true });
  writeFileSync(
    join(stage, 'share', 'containers', 'containers.conf'),
    [
      '# vendored by @vercel/container build:podman-tarballs',
      '# private runtime should set CONTAINERS_CONF=$XDG_CONFIG_HOME/containers/containers.conf',
      '# but this copy serves as a fallback for libpod defaults.',
      '[engine]',
      'helper_bin_dir = "./libexec/podman"',
      '',
    ].join('\n')
  );

  // build tarball
  mkdirSync(distDir, { recursive: true });
  const tarName = `podman-v${VERSION}-${platform}.tar.gz`;
  const tarPath = join(distDir, tarName);
  console.log(`  packing ${tarName} ...`);
  await run('tar', ['-czf', tarPath, '-C', stage, '.']);
  const sz = statSync(tarPath).size;
  const sha = await sha256File(tarPath);
  writeFileSync(`${tarPath}.sha256`, `${sha}  ${tarName}\n`);
  console.log(`  ✓ ${tarName} ${human(sz)} sha256=${sha.slice(0, 12)}…`);
  return { platform, tarPath, sha256: sha, size: sz };
}

async function buildFromGitHub(platform) {
  const asset = upstreamAssetName(platform);
  const base = `https://github.com/containers/podman/releases/download/v${VERSION}`;
  const url = `${base}/${asset}`;
  const tmp = join(
    tmpdir(),
    `podman-upstream-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tmp, { recursive: true });
  const dl = join(tmp, asset);
  console.log(`  fetching ${url}`);
  await fetchToFile(url, dl);
  console.log(`  downloaded ${human(statSync(dl).size)}`);

  // For linux remote-static tarballs, repack as-is (they're already self-contained CLI).
  // This is still useful for testing downloadAndExtract, but note it won't include
  // `machine` helpers. CI should ideally fetch brew bottles / build from source for
  // full runtime. For now we repack remote tarballs into our layout (bin/podman = remote binary).
  if (platform.startsWith('linux')) {
    const stage = join(tmp, 'stage');
    mkdirSync(join(stage, 'bin'), { recursive: true });
    await run('tar', ['-xzf', dl, '-C', tmp]);
    // tarball layouts:
    //  - full static build:        bin/podman
    //  - remote-static releases:   bin/podman-remote-static-linux_{amd64,arm64}
    const candidates = [
      join(tmp, 'bin', 'podman'),
      join(tmp, 'bin', 'podman-remote-static-linux_amd64'),
      join(tmp, 'bin', 'podman-remote-static-linux_arm64'),
      join(tmp, 'podman-remote-static-linux_amd64'),
      join(tmp, 'podman-remote-static-linux_arm64'),
      join(tmp, 'podman'),
    ];
    let srcBin = candidates.find(p => existsSync(p)) ?? null;
    if (!srcBin) {
      // deep search one level
      try {
        for (const e of readdirSync(tmp, { withFileTypes: true })) {
          if (e.isFile() && e.name.startsWith('podman')) {
            srcBin = join(tmp, e.name);
            break;
          }
          if (e.isDirectory()) {
            // Some tarballs pack under a versioned dir
            const inner = readdirSync(join(tmp, e.name), {
              withFileTypes: true,
            }).filter(f => f.isFile() && f.name.startsWith('podman'));
            if (inner.length) {
              srcBin = join(tmp, e.name, inner[0].name);
              break;
            }
            const cand = join(tmp, e.name, 'podman');
            if (existsSync(cand)) {
              srcBin = cand;
              break;
            }
          }
        }
      } catch {}
    }
    if (!srcBin)
      throw new Error(`could not find podman binary inside ${asset}`);
    copyFileSync(srcBin, join(stage, 'bin', 'podman'));
    // helpers can't be derived from remote asset — warn
    console.warn(
      `  [${platform}] ${asset} is remote-only, no machine helpers; consider --local for full runtime`
    );

    mkdirSync(distDir, { recursive: true });
    const tarName = `podman-v${VERSION}-${platform}.tar.gz`;
    const tarPath = join(distDir, tarName);
    await run('tar', ['-czf', tarPath, '-C', stage, '.']);
    const sha = await sha256File(tarPath);
    writeFileSync(`${tarPath}.sha256`, `${sha}  ${tarName}\n`);
    return { platform, tarPath, sha256: sha, size: statSync(tarPath).size };
  }

  // ---- darwin .pkg handling (works on both macOS and Linux) ----
  // Outer .pkg is xar. Inner Payload is cpio.gz (or directory after pkgutil --expand-full).
  // Strategy:
  //   macOS: pkgutil --expand-full → Payload is directory → copy directly (previous behaviour)
  //   Linux: bsdtar/xar can extract xar → then handle Payload file via bsdtar/cpio
  // So we support both hosts, which lets vercel-build (Linux) produce darwin runtimes.
  if (asset.endsWith('.pkg')) {
    const isDarwin = osPlatform() === 'darwin';
    const expandDir = join(tmp, 'expanded');
    const mergeDir = join(tmp, 'payload-merged');
    mkdirSync(mergeDir, { recursive: true });

    // Shared helpers (hoisted so both paths use them)
    function copyDirRecursiveFS(srcDir, dstDir) {
      mkdirSync(dstDir, { recursive: true });
      let entries;
      try {
        entries = readdirSync(srcDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const en of entries) {
        const s_ = join(srcDir, en.name);
        const d_ = join(dstDir, en.name);
        if (en.isDirectory()) copyDirRecursiveFS(s_, d_);
        else if (en.isSymbolicLink()) {
          try {
            const target = readlinkSync(s_);
            // Resolve relative to symlink's own directory, not srcDir root
            const resolved = resolve(dirname(s_), target);
            if (!existsSync(resolved)) continue;
            const st = lstatSync(resolved);
            if (st.isFile()) copyFileSync(resolved, d_);
            else if (st.isDirectory()) copyDirRecursiveFS(resolved, d_);
          } catch {
            /* skip dangling symlink */
          }
        } else if (en.isFile()) {
          try {
            copyFileSync(s_, d_);
          } catch {}
        }
      }
    }

    async function materializePayloadFile(pPath, dstRoot) {
      // Payload can be file (cpio, tar, xar/pbzx) — try bsdtar/gnu-tar/cpio
      try {
        await run('bsdtar', ['-xf', pPath, '-C', dstRoot]);
        return true;
      } catch {}
      try {
        await run('tar', ['-xf', pPath, '-C', dstRoot]);
        return true;
      } catch {}
      try {
        const { spawn: _sp } = await import('node:child_process');
        await new Promise((res, rej) => {
          const sh = _sp('sh', [
            '-c',
            `cd ${JSON.stringify(dstRoot)} && (cpio -idm --quiet < ${JSON.stringify(pPath)} 2>/dev/null || cpio -id < ${JSON.stringify(pPath)} 2>/dev/null)`,
          ]);
          sh.on('close', code =>
            code === 0 ? res(true) : rej(new Error(`${code}`))
          );
          sh.on('error', rej);
        });
        return true;
      } catch {}
      return false;
    }

    // Collect Payload entries (dir or file) after expansion/extraction
    let payloadEntries = [];

    if (isDarwin) {
      // pkgutil --expand-full requires target dir NOT to exist
      try {
        const { rmSync: _rm } = await import('node:fs');
        _rm(expandDir, { recursive: true, force: true });
      } catch {}
      mkdirSync(dirname(expandDir), { recursive: true });
      console.log(`  expanding .pkg via pkgutil --expand-full ...`);
      try {
        await run('pkgutil', ['--expand-full', dl, expandDir]);
      } catch (e) {
        throw new Error(
          `pkgutil --expand-full failed for ${asset}: ${e.message}. Try: sudo xcode-select --install`
        );
      }
      const stack = [expandDir];
      const seen = new Set();
      while (stack.length) {
        const cur = stack.pop();
        if (!cur || seen.has(cur)) continue;
        seen.add(cur);
        let ents;
        try {
          ents = readdirSync(cur, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of ents) {
          const p = join(cur, e.name);
          if (e.name === 'Payload') {
            payloadEntries.push(p);
            continue;
          }
          if (!e.isDirectory()) continue;
          if (e.name === 'Resources' || e.name === 'Scripts') continue;
          stack.push(p);
        }
      }
      if (!payloadEntries.length) {
        try {
          const found = execFileSync(
            'find',
            [expandDir, '-maxdepth', '6', '-name', 'Payload'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
          )
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean);
          for (const f of found) if (existsSync(f)) payloadEntries.push(f);
        } catch {}
      }
    } else {
      // Linux path — pkgutil unavailable. Podman .pkg is xar containing podman.pkg/{Payload,...}
      // Vercel's build image (Ubuntu, libarchive 3.6+) can extract xar via bsdtar.
      // macOS bsdtar has a bug that concatenates filenames, so we avoid it on darwin.
      console.log(
        `  expanding .pkg on Linux via bsdtar/xar (platform=${platform}) ...`
      );
      try {
        const { rmSync: _rm2 } = await import('node:fs');
        _rm2(expandDir, { recursive: true, force: true });
      } catch {}
      mkdirSync(expandDir, { recursive: true });
      let xarExtractOk = false;
      let lastErr = null;
      const attempt = async (cmd, args) => {
        try {
          await run(cmd, args);
          return true;
        } catch (e) {
          lastErr = e;
          return false;
        }
      };
      // Prefer xar binary when present (most faithful), then bsdtar (libarchive), then 7z
      if (await attempt('xar', ['-xf', dl, '-C', expandDir]))
        xarExtractOk = true;
      else if (await attempt('bsdtar', ['-xf', dl, '-C', expandDir]))
        xarExtractOk = true;
      else if (await attempt('7z', ['x', dl, `-o${expandDir}`, '-y']))
        xarExtractOk = true;
      if (!xarExtractOk) {
        throw new Error(
          `Could not extract xar .pkg on Linux (tried xar, bsdtar, 7z). Last error: ${lastErr?.message ?? 'unknown'}. Asset: ${asset}`
        );
      }
      // After xar extraction, we should have podman.pkg/Payload (cpio). Collect.
      const stack = [expandDir];
      const seen = new Set();
      while (stack.length) {
        const cur = stack.pop();
        if (!cur || seen.has(cur)) continue;
        seen.add(cur);
        let ents;
        try {
          ents = readdirSync(cur, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of ents) {
          const p = join(cur, e.name);
          if (e.name === 'Payload') {
            payloadEntries.push(p);
            continue;
          }
          if (!e.isDirectory()) continue;
          if (e.name === 'Resources' || e.name === 'Scripts') continue;
          stack.push(p);
        }
      }
      if (!payloadEntries.length) {
        try {
          const found = execFileSync(
            'find',
            [expandDir, '-maxdepth', '6', '-name', 'Payload'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
          )
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean);
          for (const f of found) if (existsSync(f)) payloadEntries.push(f);
        } catch {}
      }
    }

    if (!payloadEntries.length) {
      let listing = '';
      try {
        listing = execFileSync('find', [expandDir, '-maxdepth', '5'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).slice(0, 8000);
      } catch {
        try {
          listing = readdirSync(expandDir).join(', ');
        } catch {}
      }
      throw new Error(
        `no Payload found inside expanded ${asset} at ${expandDir}. Tree (8k):\n${listing}`
      );
    }
    console.log(
      `  found ${payloadEntries.length} Payload(s): ${payloadEntries.map(p => p.replace(`${expandDir}/`, '')).join(', ')}`
    );

    // Materialize each Payload (dir=copy, file=bsdtar)
    for (const pp of payloadEntries) {
      let st;
      try {
        st = statSync(pp);
      } catch {
        console.warn(`  [!] stat failed for Payload ${pp}, skipping`);
        continue;
      }
      if (st.isDirectory()) {
        copyDirRecursiveFS(pp, mergeDir);
        console.log(
          `  → merged dir Payload ${pp.replace(`${expandDir}/`, '')}`
        );
      } else {
        const ok = await materializePayloadFile(pp, mergeDir);
        if (!ok) console.warn(`  [!] Payload file extraction failed for ${pp}`);
        else
          console.log(
            `  → extracted file Payload ${pp.replace(`${expandDir}/`, '')}`
          );
      }
    }

    // Build canonical vendored layout from mergeDir.
    const stage = join(tmp, 'stage');
    mkdirSync(join(stage, 'bin'), { recursive: true });
    mkdirSync(join(stage, 'libexec', 'podman'), { recursive: true });

    const prefer = [
      join(mergeDir, 'podman/bin/podman'),
      join(mergeDir, 'podman', 'bin', 'podman'),
      join(mergeDir, 'opt/podman/bin/podman'),
      join(mergeDir, 'usr/local/bin/podman'),
      // Some installers unpack directly to ./bin/podman after Payload extraction
      join(mergeDir, 'bin/podman'),
    ];
    let podmanSrc = prefer.find(p => existsSync(p)) ?? null;
    if (!podmanSrc) {
      const stk = [mergeDir];
      const se2 = new Set();
      while (stk.length && !podmanSrc) {
        const cur = stk.pop();
        if (!cur || se2.has(cur)) continue;
        se2.add(cur);
        let ents;
        try {
          ents = readdirSync(cur, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of ents) {
          const full = join(cur, e.name);
          if (e.isFile() && e.name === 'podman') {
            podmanSrc = full;
            break;
          }
          if (
            e.isDirectory() &&
            !e.name.startsWith('.') &&
            e.name !== 'Resources' &&
            e.name !== 'Scripts'
          ) {
            if (
              cur === mergeDir ||
              cur.endsWith('/podman') ||
              cur.endsWith('/bin') ||
              cur.includes('/opt') ||
              cur.includes('/usr/local')
            )
              stk.push(full);
          }
        }
      }
    }
    if (!podmanSrc || !existsSync(podmanSrc)) {
      let ls = '';
      try {
        ls = execFileSync('find', [mergeDir, '-maxdepth', '6', '-type', 'f'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).slice(0, 10000);
      } catch {}
      throw new Error(
        `no podman binary found inside expanded pkg ${asset}. mergeDir tree:\n${ls}`
      );
    }
    copyFileSync(podmanSrc, join(stage, 'bin', 'podman'));
    console.log(`  → bin/podman ← ${podmanSrc.replace(`${mergeDir}/`, '')}`);

    const wantedHelpers = [
      'gvproxy',
      'vfkit',
      'krunkit',
      'qemu',
      'podman-mac-helper',
    ];
    function findInMerge(name_) {
      const fast = [
        join(mergeDir, `podman/bin/${name_}`),
        join(mergeDir, `podman/libexec/podman/${name_}`),
        join(mergeDir, `bin/${name_}`),
        join(mergeDir, `opt/podman/libexec/podman/${name_}`),
        join(mergeDir, `opt/podman/bin/${name_}`),
        join(mergeDir, `usr/local/libexec/podman/${name_}`),
      ];
      for (const f of fast) if (existsSync(f)) return f;
      const stk = [mergeDir];
      const seen3 = new Set();
      while (stk.length) {
        const cur = stk.pop();
        if (!cur || seen3.has(cur)) continue;
        seen3.add(cur);
        let ents;
        try {
          ents = readdirSync(cur, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of ents) {
          const full = join(cur, e.name);
          if (e.isFile() && e.name === name_) return full;
          if (
            e.isDirectory() &&
            !e.name.startsWith('.') &&
            (full.includes('podman') ||
              full.includes('libexec') ||
              cur === mergeDir)
          )
            stk.push(full);
        }
      }
      return null;
    }
    for (const nm of wantedHelpers) {
      const src = findInMerge(nm);
      if (src) {
        copyFileSync(src, join(stage, 'libexec', 'podman', nm));
        console.log(
          `  → libexec/podman/${nm} ← ${src.replace(`${mergeDir}/`, '')}`
        );
      } else
        console.warn(
          `  helper ${nm} not found inside pkg (optional), skipping`
        );
    }
    try {
      const libSrc = join(mergeDir, 'podman/lib');
      if (existsSync(libSrc)) {
        copyDirRecursiveFS(libSrc, join(stage, 'lib'));
        console.log('  → lib/ ← podman/lib');
      }
    } catch {}

    mkdirSync(join(stage, 'share', 'containers'), { recursive: true });
    writeFileSync(
      join(stage, 'share', 'containers', 'containers.conf'),
      [
        '# vendored by @vercel/container build:podman-tarballs',
        '[engine]',
        'helper_bin_dir = "./libexec/podman"',
        '',
      ].join('\n')
    );

    mkdirSync(distDir, { recursive: true });
    const tarName = `podman-v${VERSION}-${platform}.tar.gz`;
    const tarPath = join(distDir, tarName);
    console.log(`  packing ${tarName} ...`);
    await run('tar', ['-czf', tarPath, '-C', stage, '.']);
    const sz = statSync(tarPath).size;
    const sha = await sha256File(tarPath);
    writeFileSync(`${tarPath}.sha256`, `${sha}  ${tarName}\n`);
    console.log(`  ✓ ${tarName} ${human(sz)} sha256=${sha.slice(0, 12)}…`);
    return { platform, tarPath, sha256: sha, size: sz };
  }

  throw new Error(`unsupported asset ${asset} for ${platform}`);
}

async function main() {
  console.log(`▲ containers  build podman runtimes v${VERSION}`);
  console.log(
    `  platforms: ${WANTED.join(', ')}  mode=${args.local ? 'local' : 'github'}${args.dryRun ? ' (dry-run)' : ''}`
  );

  const results = [];
  for (const p of WANTED) {
    console.log(`\n→ ${p}`);
    try {
      let r;
      if (
        args.local ||
        (!args.fromGithub &&
          (p ===
            `${osPlatform()}-${osArch() === 'arm64' ? 'arm64' : 'amd64'}` ||
            p === `${osPlatform()}-amd64`))
      ) {
        // prefer local for current host platform when --local not specified? only if binary exists.
        if (!args.fromGithub) {
          try {
            r = await buildFromLocal(p);
          } catch (e) {
            console.warn(
              `  local build failed for ${p}: ${e.message}; falling back to GitHub fetch`
            );
            r = await buildFromGitHub(p);
          }
        } else {
          r = await buildFromLocal(p);
        }
      } else {
        r = await buildFromGitHub(p);
      }
      if (!r) continue;
      results.push(r);
    } catch (err) {
      console.error(`  ✗ ${p} failed: ${err.message}`);
      if (process.env.CI) throw err; // fail CI so manifest never goes partial
    }
  }

  if (args.dryRun) {
    console.log(`\ndry-run: would produce ${results.length} tarballs`);
    return;
  }

  // Write generated manifest json
  const gen = {};
  for (const r of results) {
    const key = r.platform;
    // URL format must match what `api/_lib/script/build.ts` will publish + cdnBase()
    // i.e. `<cdnBase>/runtimes/podman/v<ver>/podman-<platform>.tar.gz`
    // In local dev the CDN base is https://<preview>.vercel.app or https://vercel.com (prod).
    // We store only sha256+type here; URLs are synthesized in manifest.ts via cdnBase().
    // But for convenience we also emit full URLs using VERCEL_URL if present, so a
    // preview deployment can validate checksums.
    gen[key] = {
      // placeholder — real URL filled by manifest.ts at runtime via cdnBase()
      url: `/runtimes/podman/v${VERSION}/podman-${key}.tar.gz`,
      sha256: r.sha256,
      type: 'tgz',
      size: r.size ? `${(r.size / 1024 / 1024).toFixed(1)}MB` : undefined,
    };
  }

  mkdirSync(dirname(generatedJsonPath), { recursive: true });
  writeFileSync(generatedJsonPath, JSON.stringify(gen, null, 2) + '\n');
  console.log(
    `\n✓ wrote ${generatedJsonPath} (${Object.keys(gen).length} platforms)`
  );

  // Human summary for testing
  console.log(`\nTest with tarballs (no CDN):`);
  for (const r of results) {
    console.log(
      `  VERCEL_PODMAN_ASSET_URL=file://${r.tarPath} VERCEL_CONTAINER_ENGINE=podman-private pnpm vercel dev`
    );
  }
  if (results.some(r => r.platform.startsWith('darwin'))) {
    console.log(
      `\nAfter pushing this branch (which publishes public/runtimes via api/_lib/script/build.ts):`
    );
    console.log(
      `  VERCEL_PODMAN_CDN_BASE=https://\${VERCEL_URL} VERCEL_CONTAINER_ENGINE=podman-private vercel dev`
    );
    console.log(
      `  # prod after alias: VERCEL_PODMAN_CDN_BASE=https://vercel.com vercel dev`
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

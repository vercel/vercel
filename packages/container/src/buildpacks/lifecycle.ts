import type { Span } from '@vercel/build-utils';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildahStorageArgs } from '../storage-driver';
import { TARGET_PLATFORM } from '../engines/types';
import type { ContainerEngine, DevOutput } from '../engines/types';
import { debug, info, readString, run, step, done, withSpan } from '../util';
import {
  builderImageRef,
  defaultCacheVolumeName,
  LIFECYCLE_VENDOR_VERSION,
} from './manifest';

/**
 * Directories/files that must NOT be copied into the buildpack staging dir.
 * - host node_modules (pnpm symlink layout) confuses Paketo's npm-install:
 *   triggers "npm rebuild" path and "isDescendantOf" null errors.
 * - dist / .vercel / .git / .turbo are build outputs or VCS, not source.
 * - .pnpm-store is never needed inside container.
 */
const STAGE_EXCLUDES = new Set([
  'node_modules',
  '.git',
  '.vercel',
  '.turbo',
  '.next',
  '.output',
  'dist',
  '.pnpm-store',
  '.vercel_build_output',
]);

/** Env vars injected into every creator run (npm/cacache workaround + CNB flags). */
const NPM_WORKAROUND_ENV: Record<string, string> = {
  NPM_CONFIG_CACHE: '/tmp/npmcache',
  BP_NPM_VERSION: '11.4.2',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
};

const CNB_ENV: Record<string, string> = {
  CNB_PLATFORM_API: '0.13',
  CNB_EXPERIMENTAL_MODE: 'warn',
};

// ── shared helpers ───────────────────────────────────────────────────

function stageWorkspace(src: string): string {
  const dest = mkdtempSync(join(tmpdir(), 'vercel-bp-work-'));
  const entries = readdirSync(src);
  for (const name of entries) {
    if (STAGE_EXCLUDES.has(name)) continue;
    if (name === '.DS_Store' || name.endsWith('.log')) continue;
    const from = join(src, name);
    const to = join(dest, name);
    try {
      const st = statSync(from);
      if (st.isDirectory()) {
        cpSync(from, to, {
          recursive: true,
          filter: (srcPath: string) =>
            !srcPath.includes(`${src}/` + 'node_modules'),
        });
      } else {
        cpSync(from, to);
      }
    } catch (err) {
      debug(`stageWorkspace: skip ${name}: ${(err as Error).message}`);
    }
  }
  if (
    !existsSync(join(dest, 'project.toml')) &&
    existsSync(join(src, 'project.toml'))
  ) {
    try {
      cpSync(join(src, 'project.toml'), join(dest, 'project.toml'));
    } catch {}
  }
  return dest;
}

/** Convert a env-var map to repeated `-e KEY=VALUE` (docker/podman) or `--env KEY=VALUE` (buildah). */
function envFlags(
  vars: Record<string, string>,
  flag: string,
  extra?: Record<string, string | undefined>
): string[] {
  const flags: string[] = [];
  for (const [k, v] of Object.entries(vars)) {
    flags.push(flag, `${k}=${v}`);
  }
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (typeof v === 'string') flags.push(flag, `${k}=${v}`);
  }
  return flags;
}

function cleanupDir(dir: string | undefined): void {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function buildpackErrorHint(msg: string, cacheVol: string): string {
  if (/no space left|disk quota/i.test(msg))
    return `\n\nBuildpack builder cache volume "${cacheVol}" may be full. Try:\n  docker volume rm ${cacheVol}\n  and re-run vercel dev.`;
  if (/permission denied|socket/i.test(msg))
    return '\n\nEnsure the container engine is running and its socket is accessible, then re-run vercel dev.';
  if (/detect.*fail|no.*buildpack.*detected/i.test(msg))
    return '\n\nNo buildpack matched this project. Ensure it has a language marker (package.json, requirements.txt, go.mod, etc) or add a project.toml.\nAdd a Dockerfile to disable buildpack detection and use Docker instead.';
  if (/sizeCalculation|maxSize|maxEntrySize|lru-cache/i.test(msg))
    return '\n\nHit known npm/cacache bug with Node >=22 / npm >=10.9 in Paketo npm-install 2.3.25.\nWorkaround (applied by @vercel/container now): sets NPM_CONFIG_CACHE=/tmp/npmcache\nand BP_NPM_VERSION=11.4.2; staging removes host node_modules. If it persists, try:\n  rm -rf node_modules dist && npm i --package-lock-only && vercel dev';
  return '';
}

// ── types ────────────────────────────────────────────────────────────

export interface BuildpackBuildParams {
  workPath: string;
  tag: string;
  buildArgs?: Record<string, string>;
  builder?: string;
  serviceName?: string;
}

export interface BuildpackBuildResult {
  tag: string;
  builder: string;
  lifecycleVersion: string;
}

export interface CloudBuildParams extends BuildpackBuildParams {
  /** Full registry ref to push to (e.g. vcr.vercel.com/team/project/api:abc123). */
  imageRef: string;
}

// ── dev path: docker / podman ────────────────────────────────────────
//
// Docker: creator -daemon writes directly to the Docker daemon via a
//   mounted /var/run/docker.sock — no import step needed.
// Podman: creator --layout writes an OCI layout to a host tmpdir, then
//   `podman pull oci:$dir` imports it into Podman's store. (macOS APFS
//   can't bind-mount the podman socket into the AppleHV VM, so -daemon
//   is not available for podman.)

async function resolveDevBin(
  engine: ContainerEngine
): Promise<{ bin: string; env?: NodeJS.ProcessEnv }> {
  if (engine.name === 'docker') return { bin: 'docker' };
  const mod = await import('../engines/podman');
  if (engine.name === 'podman-private') {
    return {
      bin: mod.privateBin(),
      env: mod.privateEnv() as NodeJS.ProcessEnv,
    };
  }
  return { bin: 'podman' };
}

/** Spawn a process and route stdout/stderr through DevOutput (for dev build progress). */
async function runWithOutput(
  bin: string,
  args: string[],
  out: DevOutput,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  const { spawn } = await import('node:child_process');
  debug(`exec: ${bin} ${args.join(' ')}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (c: Buffer) => {
      if (out.onStdout) out.onStdout(c);
      else process.stderr.write(c as unknown as Uint8Array);
    });
    child.stderr?.on('data', (c: Buffer) => {
      if (out.onStderr) out.onStderr(c);
      else process.stderr.write(c as unknown as Uint8Array);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Command not found: \`${bin}\`. The container engine must be available for buildpack builds.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`\`${bin} ${args[0]}\` exited ${code}`));
    });
  });
}

export async function buildDevImage(
  engine: ContainerEngine,
  params: BuildpackBuildParams,
  out: DevOutput,
  span?: Span
): Promise<BuildpackBuildResult> {
  return withSpan(
    span,
    'container.buildpack.dev_build',
    {
      'buildpack.builder': params.builder ?? builderImageRef(),
      'buildpack.engine': engine.name,
      'buildpack.service': params.serviceName ?? 'service',
      'image.tag': params.tag,
      'buildpack.lifecycle_version': LIFECYCLE_VENDOR_VERSION,
    },
    async s => {
      const builder = params.builder ?? builderImageRef();
      const isDocker = engine.name === 'docker';
      const isPodmanLike = engine.name.startsWith('podman');
      const useDaemon = isDocker; // docker has socket; podman uses --layout
      const wantPlatform =
        process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64';
      const cacheVol = defaultCacheVolumeName(params.serviceName ?? 'service');

      const { bin, env } = await resolveDevBin(engine);

      // ── pull builder ──────────────────────────────────────────────
      step(
        `Pulling buildpack builder ${builder} (first run ~300MB, cached, platform=${wantPlatform})`
      );
      try {
        await run(bin, ['pull', '--platform', wantPlatform, builder], {
          env,
          quiet: false,
        });
        done(`builder ready: ${builder}`);
      } catch (err) {
        debug(
          `builder pull failed (may already be cached): ${(err as Error).message}`
        );
        // Don't fail — run will fail later with a clearer error if truly missing.
      }

      // ── staging ───────────────────────────────────────────────────
      let stagedDir: string | undefined;
      let effectiveWorkPath = params.workPath;
      try {
        stagedDir = stageWorkspace(params.workPath);
        effectiveWorkPath = stagedDir;
        debug(
          `buildpack staging dir: ${stagedDir} (filtered copy of ${params.workPath})`
        );
      } catch (err) {
        debug(
          `buildpack stage copy failed, falling back to direct mount: ${(err as Error).message}`
        );
      }

      let layoutDir: string | undefined;
      if (!useDaemon) {
        layoutDir = mkdtempSync(join(tmpdir(), 'vercel-bp-layout-'));
        debug(`buildpack layout dir: ${layoutDir}`);
      }

      // ── run creator ───────────────────────────────────────────────
      const runArgs: string[] = [
        'run',
        '--rm',
        '--platform',
        wantPlatform,
        ...envFlags(NPM_WORKAROUND_ENV, '-e'),
        ...envFlags(CNB_ENV, '-e'),
        ...envFlags({}, '-e', params.buildArgs),
        '-v',
        `${effectiveWorkPath}:/workspace:ro`,
      ];

      // Cache volume (skip on Windows podman — volume sharing is unreliable).
      if (!(isPodmanLike && process.platform === 'win32')) {
        runArgs.push('-v', `${cacheVol}:/cache`);
      }

      // Docker: mount the daemon socket so creator -daemon can write the image.
      if (isDocker) {
        try {
          if (existsSync('/var/run/docker.sock')) {
            runArgs.push('-v', '/var/run/docker.sock:/var/run/docker.sock');
          }
        } catch {}
      }

      // Podman: mount the layout dir for creator --layout output.
      if (!useDaemon && layoutDir) {
        runArgs.push('-v', `${layoutDir}:/layout`);
      }

      runArgs.push(builder, '/cnb/lifecycle/creator');
      runArgs.push(
        '-app=/workspace',
        '-cache-dir=/cache',
        '-skip-restore', // dev: no previous image to restore from
        ...(useDaemon
          ? (['-daemon'] as string[])
          : (['--layout', '--layout-dir=/layout'] as string[])),
        params.tag
      );

      step(`Building with buildpacks (${builder}) -> ${params.tag}`);
      try {
        await runWithOutput(bin, runArgs, out, env);

        // Podman: import the OCI layout into the local store.
        if (!useDaemon && layoutDir) {
          step(`Importing buildpack image ${params.tag} from OCI layout`);
          try {
            await run(bin, ['pull', '--quiet', `oci:${layoutDir}`], {
              env,
              quiet: false,
            });
          } catch (importErr) {
            debug(
              `OCI layout import failed, trying skopeo: ${(importErr as Error).message}`
            );
            try {
              await run(
                'skopeo',
                [
                  'copy',
                  `oci:${layoutDir}`,
                  `containers-storage:${params.tag}`,
                ],
                { quiet: false }
              );
            } catch (skopeoErr) {
              throw new Error(
                `Could not import buildpack image ${params.tag}: ${(importErr as Error).message}. skopeo fallback also failed: ${(skopeoErr as Error).message}`
              );
            }
          }
        }

        done(`built ${params.tag} via buildpack lifecycle`);
      } catch (err) {
        const msg = (err as Error).message;
        throw new Error(
          [
            `Buildpack build failed via lifecycle/creator (${builder}).`,
            '',
            `Underlying error: ${msg}${buildpackErrorHint(msg, cacheVol)}`,
            '',
            `Buildpack project is ${params.workPath}${stagedDir ? ` (staged as ${stagedDir})` : ''}`,
            `To disable buildpacks for this project, add an empty Dockerfile.`,
          ].join('\n')
        );
      } finally {
        cleanupDir(stagedDir);
        cleanupDir(layoutDir);
      }

      s?.setAttributes({ 'buildpack.builder_pulled': 'true' });
      return {
        tag: params.tag,
        builder,
        lifecycleVersion: LIFECYCLE_VENDOR_VERSION,
      };
    }
  );
}

// ── cloud path: buildah ──────────────────────────────────────────────
//
// Buildah is daemonless — `buildah run` operates on a *working container*
// (created by `buildah from`), not on an image ref directly. The sequence
// is:
//
//   buildah pull --platform linux/amd64 $builder
//   ctr=$(buildah from --platform linux/amd64 $builder)
//   buildah run --network host -v $staged:/workspace:ro \
//     -v $layout:/layout -v $cache:/cache --env ... $ctr -- \
//     /cnb/lifecycle/creator --layout --layout-dir=/layout $tag
//   buildah rm $ctr
//   buildah push oci:$layout $imageRef   (push layout directly — no import/tag)

async function runBuildah(
  args: string[],
  opts?: { input?: string; quiet?: boolean }
) {
  const storageArgs = await buildahStorageArgs();
  const fullArgs = [...storageArgs, ...args];
  debug(`exec: buildah ${fullArgs.join(' ')}`);
  return run('buildah', fullArgs, opts ?? {});
}

export async function buildAndPushCloudImage(
  params: CloudBuildParams,
  span?: Span
): Promise<string | undefined> {
  return withSpan(
    span,
    'container.buildpack.cloud_build_and_push',
    {
      'buildpack.builder': params.builder ?? builderImageRef(),
      'buildpack.service': params.serviceName ?? 'service',
      'image.tag': params.tag,
      'image.ref': params.imageRef,
      'buildpack.lifecycle_version': LIFECYCLE_VENDOR_VERSION,
    },
    async s => {
      const builder = params.builder ?? builderImageRef();

      // ── pull builder ──────────────────────────────────────────────
      step(
        `Pulling buildpack builder ${builder} (platform=${TARGET_PLATFORM})`
      );
      try {
        await runBuildah(['pull', '--platform', TARGET_PLATFORM, builder], {
          quiet: false,
        });
        done(`builder ready: ${builder}`);
      } catch (err) {
        debug(
          `builder pull failed (may already be cached): ${(err as Error).message}`
        );
      }

      // ── staging ───────────────────────────────────────────────────
      let stagedDir: string | undefined;
      let effectiveWorkPath = params.workPath;
      try {
        stagedDir = stageWorkspace(params.workPath);
        effectiveWorkPath = stagedDir;
        debug(`buildpack staging dir: ${stagedDir}`);
      } catch (err) {
        debug(
          `buildpack stage copy failed, falling back to direct mount: ${(err as Error).message}`
        );
      }

      let layoutDir: string | undefined;
      let cacheDir: string | undefined;
      try {
        layoutDir = mkdtempSync(join(tmpdir(), 'vercel-bp-layout-'));
        cacheDir = mkdtempSync(join(tmpdir(), 'vercel-bp-cache-'));
        debug(`buildpack layout dir: ${layoutDir}`);
        debug(`buildpack cache dir: ${cacheDir}`);

        // ── create working container from builder ───────────────────
        const { stdout } = await runBuildah(
          ['from', '--platform', TARGET_PLATFORM, builder],
          { quiet: true }
        );
        const ctr = stdout.trim().split('\n').pop();
        if (!ctr) {
          throw new Error(
            `buildah from ${builder} did not output a container name`
          );
        }
        debug(`buildah working container: ${ctr}`);

        try {
          // ── run creator inside working container ──────────────────
          step(
            `Building with buildpacks (${builder}) -> ${params.imageRef} (platform=${TARGET_PLATFORM})`
          );
          await runBuildah([
            'run',
            '--network',
            'host',
            '-v',
            `${effectiveWorkPath}:/workspace:ro`,
            '-v',
            `${layoutDir}:/layout`,
            '-v',
            `${cacheDir}:/cache`,
            ...envFlags(NPM_WORKAROUND_ENV, '--env'),
            ...envFlags(CNB_ENV, '--env'),
            ...envFlags({}, '--env', params.buildArgs),
            ctr,
            '--',
            '/cnb/lifecycle/creator',
            '-app=/workspace',
            '-cache-dir=/cache',
            // cloud: enable restore for layer cache reuse (prepareCache + warm store)
            '--layout',
            '--layout-dir=/layout',
            params.tag,
          ]);
        } finally {
          // Always remove the working container, even on failure.
          await runBuildah(['rm', ctr]).catch(() => {});
        }

        // ── push OCI layout directly to registry ────────────────────
        step(`Pushing ${params.imageRef}`);
        const digestDir = mkdtempSync(join(tmpdir(), 'vercel-bp-digest-'));
        const digestFile = join(digestDir, 'digest');
        try {
          const zstdEnabled = !readString(process.env.VERCEL_VCR_DISABLE_ZSTD);
          const zstdArgs = zstdEnabled
            ? [
                '--compression-format',
                'zstd',
                '--compression-level',
                '3',
                '--force-compression',
                '--format',
                'oci',
              ]
            : [];
          info(
            `pushing ${params.imageRef} ` +
              (zstdEnabled
                ? 'with zstd compression (level=3, force, oci)'
                : 'with default compression')
          );
          const pushStart = Date.now();
          await runBuildah([
            'push',
            ...zstdArgs,
            '--digestfile',
            digestFile,
            `oci:${layoutDir}`,
            params.imageRef,
          ]);
          const rawDigest = readFileSync(digestFile, 'utf8').trim();
          const digest =
            rawDigest.match(/sha256:[a-f0-9]{64}/)?.[0] ?? undefined;
          done(
            digest
              ? `pushed ${digest.slice(0, 19)} in ${Date.now() - pushStart}ms`
              : `pushed in ${Date.now() - pushStart}ms`
          );
          s?.setAttributes({
            'image.digest': digest ?? '',
          });
          return digest;
        } finally {
          cleanupDir(digestDir);
        }
      } catch (err) {
        const msg = (err as Error).message;
        throw new Error(
          [
            `Buildpack cloud build failed via lifecycle/creator (${builder}).`,
            '',
            `Underlying error: ${msg}`,
            '',
            `Buildpack project is ${params.workPath}${stagedDir ? ` (staged as ${stagedDir})` : ''}`,
            `To disable buildpacks for this project, add an empty Dockerfile.`,
          ].join('\n')
        );
      } finally {
        cleanupDir(stagedDir);
        cleanupDir(layoutDir);
        cleanupDir(cacheDir);
      }
    }
  );
}

import type { Span } from '@vercel/build-utils';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildahStorageArgs } from '../storage-driver';
import { TARGET_PLATFORM } from '../engines/types';
import type { ContainerEngine, DevOutput } from '../engines/types';
import { debug, run, step, done, withSpan } from '../util';
import { builderImageRef, LIFECYCLE_VENDOR_VERSION } from './manifest';

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

/**
 * Lifecycle-first buildpack path — no `pack` CLI, no host binary.
 *
 * Builder image has `/cnb/lifecycle/creator` embedded.
 *
 * Local:
 *   docker        → `docker run -v $work:/workspace -v /var/run/docker.sock:/var/run/docker.sock ... $builder /cnb/lifecycle/creator -daemon ... $tag`
 *   podman/private→ `podman run -v $work:/workspace -v $layout:/layout ... $builder /cnb/lifecycle/creator --layout --layout-dir=/layout ... $tag` + `podman pull oci:$layout`
 *
 * Cloud (buildah — P0):
 *   - Pull builder with `buildah pull --platform linux/amd64 $builder` (storage args from buildahStorageArgs, graphRoot=/vercel/.containers/storage)
 *   - Run creator daemonless: `buildah run --volume $staged:/workspace --volume $layout:/layout --volume $cache:/cache --env ... $builder -- /cnb/lifecycle/creator -app=/workspace -cache-dir=/cache --layout --layout-dir=/layout $tag`
 *   - Import OCI layout: `buildah pull oci:$layoutDir` → image exists as $tag in buildah store, ready for `buildah push` (with zstd)
 *
 * Zero extra binaries: no pack, no skopeo required for buildah path (podman path keeps skopeo fallback).
 */

export type OutputMode = 'daemon' | 'layout' | 'buildah-layout';

export interface LifecycleBuildParams {
  workPath: string;
  tag: string;
  buildArgs?: Record<string, string>;
  builder?: string;
  serviceName?: string;
  outputMode?: OutputMode;
  /**
   * true = pass -skip-restore (dev first build, no cache). false/undefined = enable restore (cloud, layer cache reuse).
   * Default: buildah → false (cloud wants restore), others → true (dev).
   */
  skipRestore?: boolean;
}

export interface LifecycleBuildResult {
  tag: string;
  builder: string;
  lifecycleVersion: string;
}

function mapBuildArgsToEnvFlags(
  buildArgs: Record<string, string> | undefined
): string[] {
  const flags: string[] = [];
  for (const [k, v] of Object.entries(buildArgs ?? {})) {
    flags.push('-e', `${k}=${v}`);
  }
  return flags;
}

function resolveOutputMode(
  engine: ContainerEngine,
  explicit?: OutputMode
): OutputMode {
  if (explicit) return explicit;
  if (engine.name === 'buildah') return 'buildah-layout';
  if (engine.name === 'docker') return 'daemon';
  if (engine.name.startsWith('podman')) return 'layout';
  return 'layout';
}

async function runEngine(
  engine: ContainerEngine,
  args: string[],
  out: DevOutput,
  opts?: { env?: NodeJS.ProcessEnv }
): Promise<void> {
  const { spawn } = await import('node:child_process');
  const isPodman = engine.name === 'podman' || engine.name === 'podman-private';
  const isBuildah = engine.name === 'buildah';

  let bin: string;
  let env: NodeJS.ProcessEnv | undefined;
  let storagePrepend: string[] = [];

  if (isBuildah) {
    bin = 'buildah';
    try {
      storagePrepend = await buildahStorageArgs();
    } catch {
      storagePrepend = [];
    }
  } else if (isPodman) {
    const mod = await import('../engines/podman');
    if (engine.name === 'podman-private') {
      bin = mod.privateBin();
      env = mod.privateEnv() as NodeJS.ProcessEnv;
    } else {
      bin = 'podman';
    }
  } else {
    bin = 'docker';
  }

  const mergedEnv = {
    ...(opts?.env ?? env ?? process.env),
  } as NodeJS.ProcessEnv;

  // buildah CLI: `buildah [--root ... --runroot ... --registries-conf ... --storage-driver ...] <verb> ...`
  // verb must come AFTER global storage flags.
  const execArgs =
    isBuildah && storagePrepend.length ? [...storagePrepend, ...args] : args;

  debug(`exec: ${bin} ${execArgs.join(' ')} [buildpack lifecycle]`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, execArgs, {
      env: mergedEnv,
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
      else reject(new Error(`\`${bin} ${execArgs[0]}\` exited ${code}`));
    });
  });
}

export async function buildWithLifecycle(
  engine: ContainerEngine,
  params: LifecycleBuildParams,
  out: DevOutput,
  span?: Span
): Promise<LifecycleBuildResult> {
  return withSpan(
    span,
    'container.buildpack.lifecycle_build',
    {
      'buildpack.builder': params.builder ?? builderImageRef(),
      'buildpack.engine': engine.name,
      'buildpack.service': params.serviceName ?? 'service',
      'image.tag': params.tag,
      'buildpack.lifecycle_version': LIFECYCLE_VENDOR_VERSION,
    },
    async s => {
      const builder = params.builder ?? builderImageRef();
      const outputMode = resolveOutputMode(engine, params.outputMode);
      const isPodmanLike = engine.name.startsWith('podman');
      const isDocker = engine.name === 'docker';
      const isBuildah = engine.name === 'buildah';
      const isLayout =
        outputMode === 'layout' || outputMode === 'buildah-layout';

      const cacheVol = `vercel-bp-cache-${(params.serviceName ?? 'app').toLowerCase()}`;

      const wantPlatform = isBuildah
        ? TARGET_PLATFORM
        : process.arch === 'arm64'
          ? 'linux/arm64'
          : 'linux/amd64';

      // ── pull builder (cache by engine image store) ─────────────────
      step(
        `Pulling buildpack builder ${builder} (first run ~300MB, cached, platform=${wantPlatform})`
      );
      try {
        if (isBuildah) {
          // buildah pull with storage args, platform forced to linux/amd64
          await runEngine(
            engine,
            ['pull', '--platform', wantPlatform, builder],
            out
          );
        } else if (isPodmanLike) {
          const { privateBin, privateEnv } = await import('../engines/podman');
          const bin =
            engine.name === 'podman-private' ? privateBin() : 'podman';
          const env =
            engine.name === 'podman-private'
              ? (privateEnv() as NodeJS.ProcessEnv)
              : undefined;
          await run(bin, ['pull', '--platform', wantPlatform, builder], {
            env,
            quiet: false,
          });
        } else {
          await run('docker', ['pull', '--platform', wantPlatform, builder], {
            quiet: false,
          });
        }
        done(`builder ready: ${builder}`);
        s?.setAttributes({
          'buildpack.builder_pulled': 'true',
          'buildpack.output_mode': outputMode,
        });
      } catch (err) {
        debug(
          `builder pull failed (may already be cached / network issue): ${(err as Error).message}`
        );
        s?.setAttributes({
          'buildpack.builder_pull_error': (err as Error).message,
        });
        // Don't fail the build if pull fails but image already exists locally.
        // runEngine will fail later with a clearer error if the image is truly missing.
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

      const envFlags = mapBuildArgsToEnvFlags(params.buildArgs);
      const npmWorkaroundFlags: string[] = [
        '-e',
        'NPM_CONFIG_CACHE=/tmp/npmcache',
        '-e',
        'BP_NPM_VERSION=11.4.2',
        '-e',
        'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
      ];

      // buildah run does NOT support --platform or --rm (container is transient by default in buildah run).
      // docker/podman do.
      const platformFlag = isBuildah
        ? []
        : isDocker || isPodmanLike
          ? ['--platform', wantPlatform]
          : [];
      const runExtra = isBuildah ? [] : ['--rm'];

      const workspaceMount = `${effectiveWorkPath}:/workspace:ro`;

      // cache mount: docker/podman use named volume, buildah uses host tmpdir (daemonless, no volume abstraction needed for P0)
      let cacheArgs: string[] = [];
      let buildahCacheDir: string | undefined;
      if (isBuildah) {
        buildahCacheDir = mkdtempSync(join(tmpdir(), 'vercel-bp-cache-'));
        cacheArgs = ['-v', `${buildahCacheDir}:/cache`];
        debug(`buildpack buildah cache dir: ${buildahCacheDir}`);
      } else {
        const cacheMount = `${cacheVol}:/cache`;
        cacheArgs =
          isPodmanLike && process.platform === 'win32'
            ? []
            : ['-v', cacheMount];
      }

      // buildah run: `buildah run [options] <ctr-or-image> [--] <command>`
      // Must separate run options / image from creator command with explicit `--` so buildah doesn't try to parse
      // creator flags as its own.
      const creatorArgs: string[] = [
        'run',
        ...runExtra,
        ...platformFlag,
        ...envFlags,
        ...npmWorkaroundFlags,
        '-v',
        workspaceMount,
      ];

      if (cacheArgs.length) creatorArgs.push(...cacheArgs);

      if (isDocker) {
        const dockerSock = '/var/run/docker.sock';
        try {
          if (existsSync(dockerSock)) {
            creatorArgs.push('-v', `${dockerSock}:/var/run/docker.sock`);
          }
        } catch {}
      }

      creatorArgs.push('-e', 'CNB_PLATFORM_API=0.13');
      creatorArgs.push('-e', 'CNB_EXPERIMENTAL_MODE=warn');

      let layoutHostDir: string | undefined;
      if (isLayout) {
        layoutHostDir = mkdtempSync(join(tmpdir(), 'vercel-bp-layout-'));
        debug(`buildpack layout dir: ${layoutHostDir}`);
        creatorArgs.push('-v', `${layoutHostDir}:/layout`);
      }

      // skip-restore logic: cloud (buildah) wants restore enabled for layer cache reuse (prepareCache + buildah store warm).
      // dev wants skip-restore for first build (empty volume).
      const shouldSkipRestore =
        params.skipRestore !== undefined ? params.skipRestore : !isBuildah;

      if (isBuildah) {
        creatorArgs.push(builder, '--', '/cnb/lifecycle/creator');
      } else {
        creatorArgs.push(builder, '/cnb/lifecycle/creator');
      }
      creatorArgs.push(
        '-app=/workspace',
        '-cache-dir=/cache',
        ...(shouldSkipRestore ? ['-skip-restore'] : []),
        ...(isLayout
          ? (['--layout', '--layout-dir=/layout'] as string[])
          : (['-daemon'] as string[])),
        params.tag
      );

      step(
        `Building with buildpacks (${builder}) → ${params.tag} [${outputMode}]`
      );
      try {
        await runEngine(engine, creatorArgs, out);

        if (isLayout && layoutHostDir) {
          step(`Importing buildpack image ${params.tag} from OCI layout`);
          if (isBuildah) {
            // buildah stores images in its own store under /vercel/.containers/storage in cloud.
            // `buildah pull oci:$dir` imports the layout-dir written by creator.
            try {
              await runEngine(
                engine,
                ['pull', '--quiet', `oci:${layoutHostDir}`],
                out
              );
              // Ensure the imported image is addressable by the expected tag.
              // Creator writes index.json with `org.opencontainers.image.ref.name=$tag`, so pull should already tag it,
              // but we tag explicitly to be safe — idempotent.
              await runEngine(
                engine,
                ['tag', params.tag, params.tag],
                out
              ).catch(() => {});
            } finally {
              try {
                rmSync(layoutHostDir, { recursive: true, force: true });
              } catch {}
              if (buildahCacheDir) {
                try {
                  rmSync(buildahCacheDir, { recursive: true, force: true });
                } catch {}
              }
            }
          } else {
            // podman / podman-private path (local dev) — existing logic with skopeo fallback.
            try {
              const { privateBin, privateEnv } = await import(
                '../engines/podman'
              );
              const bin =
                engine.name === 'podman-private' ? privateBin() : 'podman';
              const env =
                engine.name === 'podman-private'
                  ? (privateEnv() as NodeJS.ProcessEnv)
                  : undefined;

              await run(bin, ['pull', '--quiet', `oci:${layoutHostDir}`], {
                env,
                quiet: false,
              });
              await run(bin, ['tag', params.tag, params.tag], {
                env,
                quiet: true,
              }).catch(() => {});
            } catch (importErr) {
              debug(
                `OCI layout import failed, falling back to skopeo: ${(importErr as Error).message}`
              );
              try {
                await run(
                  'skopeo',
                  [
                    'copy',
                    `oci:${layoutHostDir}`,
                    `containers-storage:${params.tag}`,
                  ],
                  { quiet: false }
                );
              } catch (skopeoErr) {
                throw new Error(
                  `OCI layout at ${layoutHostDir} could not be imported as ${params.tag}: ${(importErr as Error).message}. skopeo fallback also failed: ${(skopeoErr as Error).message}`
                );
              }
            } finally {
              try {
                rmSync(layoutHostDir, { recursive: true, force: true });
              } catch {}
            }
          }
        }

        done(`built ${params.tag} via buildpack lifecycle [${outputMode}]`);
      } catch (err) {
        const msg = (err as Error).message;
        for (const d of [stagedDir, layoutHostDir, buildahCacheDir]) {
          if (!d) continue;
          try {
            rmSync(d, { recursive: true, force: true });
          } catch {}
        }
        const hint = /no space left|disk quota/i.test(msg)
          ? `\n\nBuildpack builder cache volume "${cacheVol}" may be full. Try:\n  ${engine.name === 'docker' ? 'docker' : 'podman'} volume rm ${cacheVol}\n  and re-run vercel dev.`
          : /permission denied|socket/i.test(msg)
            ? `\n\nLifecycle could not write the image to the container engine.\nEnsure ${engine.name} is running and its socket is accessible, then re-run vercel dev.`
            : /detect.*fail|no.*buildpack.*detected/i.test(msg)
              ? `\n\nNo buildpack matched this project. Ensure it has a language marker (package.json, requirements.txt, go.mod, etc) or add a project.toml.\nAdd a Dockerfile to disable buildpack detection and use Docker instead.`
              : /sizeCalculation|maxSize|maxEntrySize|lru-cache/i.test(msg)
                ? `\n\nHit known npm/cacache bug with Node ≥22 / npm ≥10.9 in Paketo npm-install 2.3.25.\nWorkaround (applied by @vercel/container now): sets NPM_CONFIG_CACHE=/tmp/npmcache\nand BP_NPM_VERSION=11.4.2; staging removes host node_modules. If it persists, try:\n  rm -rf node_modules dist && npm i --package-lock-only && vercel dev\nand ensure you're on @vercel/container ≥ with this fix.`
                : '';
        throw new Error(
          [
            `Buildpack build failed via lifecycle/creator (${builder}) [${outputMode}].`,
            '',
            `Command roughly: ${engine.name} run --rm -v $PWD:/workspace ${builder} /cnb/lifecycle/creator -app=/workspace … ${params.tag}`,
            '',
            `Underlying error: ${msg}${hint}`,
            '',
            `Buildpack project is ${params.workPath}${stagedDir ? ` (staged as ${stagedDir})` : ''}`,
            `To disable buildpacks for this project, add an empty Dockerfile.`,
          ].join('\n')
        );
      }

      for (const d of [stagedDir, buildahCacheDir]) {
        if (!d) continue;
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {}
      }
      // layoutHostDir already cleaned in import block; double-clean safe.
      if (layoutHostDir) {
        try {
          rmSync(layoutHostDir, { recursive: true, force: true });
        } catch {}
      }

      return {
        tag: params.tag,
        builder,
        lifecycleVersion: LIFECYCLE_VENDOR_VERSION,
      };
    }
  );
}

export { builderImageRef };

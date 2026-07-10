import type { Span } from '@vercel/build-utils';
import { join } from 'node:path';
import type { ContainerEngine, DevOutput } from '../engines/types';
import { debug, run, step, done, withSpan } from '../util';
import { builderImageRef, LIFECYCLE_VENDOR_VERSION } from './manifest';

/**
 * Lifecycle-first buildpack path — no `pack` CLI, no host binary.
 *
 * Uses the builder image's embedded `/cnb/lifecycle/creator` via the already
 * selected container engine (docker / podman / podman-private).
 *
 * Flow (invisible to user):
 *   1. engine already ensures podman-private is installed + machine running on macOS
 *   2. pull builder image (cached by engine's private image store)
 *   3. run: builder /cnb/lifecycle/creator -app=/workspace ...
 *   4. tag output as $devImageTag (e.g. vercel-dev/service:dev)
 *   5. return $tag → existing `engine.devRun` launches it like any other dev image
 *
 * Reference (pack does approximately the same, but with extra indirection):
 *   https://buildpacks.io/docs/for-app-developers/how-it-works/
 *   `pack build $tag --builder $builder --path $workPath`
 *   expands to roughly:
 *   `docker run --privileged builder /cnb/lifecycle/creator -app=/workspace -cache-dir=...`
 */

export interface LifecycleBuildParams {
  workPath: string;
  tag: string;
  /** Project build env forwarded as CNB env vars (BP_*, etc). */
  buildArgs?: Record<string, string>;
  /** Explicit builder override; defaults to manifest.builderImageRef(). */
  builder?: string;
  /** Service name, used for cache volume naming. */
  serviceName?: string;
}

export interface LifecycleBuildResult {
  tag: string;
  builder: string;
  lifecycleVersion: string;
}

function mapBuildArgsToEnvFlags(
  buildArgs: Record<string, string> | undefined
): string[] {
  // Buildpacks consume env vars, not --build-arg. Forward everything as -e KEY
  // plus expose via env file. For lifecycle/creator specifically we pass via
  // `-e KEY=VAL` into the creator container's env, which buildpacks read.
  const flags: string[] = [];
  for (const [k, v] of Object.entries(buildArgs ?? {})) {
    flags.push('-e', `${k}=${v}`);
  }
  return flags;
}

async function runEngine(
  engine: ContainerEngine,
  args: string[],
  out: DevOutput,
  opts?: { env?: NodeJS.ProcessEnv }
): Promise<void> {
  // Engine types expose devBuild/devRun as `docker/podman build/run`.
  // For the creator step we need a generic `run` invocation on the underlying
  // binary. We re-use util.run with engine's bin + env resolution.
  //
  // To stay decoupled, we resolve bin/env from the engine instance via the
  // same helpers podman.ts uses. For docker engine bin is always "docker".
  // For podman engines we import private bin/env if isolated.
  const { spawn } = await import('node:child_process');
  const isPodman = engine.name === 'podman' || engine.name === 'podman-private';

  // Resolve underlying bin + env the same way podman.ts factory does.
  let bin: string;
  let env: NodeJS.ProcessEnv | undefined;
  if (isPodman) {
    // Dynamic import avoids cycles (private.ts does not import podman.ts).
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

  debug(`exec: ${bin} ${args.join(' ')} [buildpack lifecycle]`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
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
      else reject(new Error(`\`${bin} ${args[0]}\` exited ${code}`));
    });
  });
}

/**
 * Build an app directory into an OCI image using lifecycle/creator inside
 * the builder image — no host pack binary required.
 *
 * Invisible to the user: called from `resolveDevImage` when no Dockerfile is
 * found but source markers indicate a buildpack project.
 */
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
      const cacheVol = `vercel-bp-cache-${(
        params.serviceName ?? 'app'
      ).toLowerCase()}`;
      // Ephemeral layer cache directory inside a named volume — lifecycle writes
      // buildpack layer cache here; volume survives across dev rebuilds for faster
      // incremental builds. Second mount is source + result image tag.

      // Ensure builder is pulled (engine's pull is cached; first pull ~300MB on
      // jammy-base, subsequent is instant). Use engine login flow if builder is
      // in a private registry (future: GHCR auth via OIDC).
      step(`Pulling buildpack builder ${builder} (first run ~300MB, cached)`);
      try {
        if (engine.name === 'podman' || engine.name === 'podman-private') {
          // Podman pull via internal run helper so we reuse privateEnv().
          const { privateBin, privateEnv } = await import('../engines/podman');
          const bin =
            engine.name === 'podman-private' ? privateBin() : 'podman';
          const env =
            engine.name === 'podman-private'
              ? (privateEnv() as NodeJS.ProcessEnv)
              : undefined;
          await run(bin, ['pull', builder], {
            env,
            quiet: false,
          });
        } else {
          await run('docker', ['pull', builder], { quiet: false });
        }
        done(`builder ready: ${builder}`);
        s?.setAttributes({ 'buildpack.builder_pulled': 'true' });
      } catch (err) {
        debug(
          `builder pull failed (may already be cached / network issue): ${(err as Error).message}`
        );
        // lifecycle creator will fail quickly with a clear message if builder
        // image is genuinely missing; don't block here.
        s?.setAttributes({
          'buildpack.builder_pull_error': (err as Error).message,
        });
      }

      // Creator invocation.
      //
      // Notes:
      // - --privileged is often required by Paketo builders for certain buildpacks (apt, etc).
      //   Podman rootless needs --privileged for reexec helpers. Match `pack build --trust-builder`.
      // - CNB platform dir /platform/env is populated from our buildArgs env.
      // - We mount the app at /workspace (CNB convention).
      // - We run as the same UID (Paketo builders expect non-root 1000/vcap).
      // - -v cache: lifecycle writes layer + launch caches there for incremental builds.
      // - Image is written to daemon via `creator` (default). No export needed.
      //
      // Authoritative lifecycle docs:
      //   https://buildpacks.io/docs/for-app-developers/how-it-works/
      //   /cnb/lifecycle/creator -help
      //
      // To discover creator flags on a repo with Docker:
      //   docker run --rm --entrypoint /cnb/lifecycle/creator $builder --help

      const envFlags = mapBuildArgsToEnvFlags(params.buildArgs);

      // Buildpack caches volume (named, so it survives `vercel dev` restarts).
      // Podman --rm doesn't remove named volumes, only anonymous. Good: faster rebuilds.
      const cacheMount = `${cacheVol}:/cache`;
      const cacheArgs =
        engine.name.startsWith('podman') && process.platform === 'win32'
          ? [] // Windows filter: named volume fine, just not path syntax adjacent issues.
          : ['-v', cacheMount];

      // For dev we want the final app image to run with PORT env injected via --env-file
      // later (dev.go's merge). So creator doesn't need PORT; dev.ts will inject it at run time.

      const creatorArgs = [
        'run',
        '--rm',
        // Lifecycle reads CNB platform env from /platform/env automatically; we pass
        // build args as container env (-e) so buildpacks can consume them (BP_NODE_VERSION etc).
        ...envFlags,
        '-v',
        `${params.workPath}:/workspace:ro`,
        ...cacheArgs,
        // Output image: `creator` as of lifecycle 0.14+ can write to daemon directly when run in a
        // container that can talk to docker.sock. We instead use the "daemonless" local export pattern:
        // mount the Docker/Podman socket so creator can push to daemon. For Podman the socket path
        // is engine-managed in privateEnv() (CONTAINER_HOST not set, Podman finds it via XDG runtime).
        //
        // Simpler invariant for v1: use `--privileged --env DOCKER_HOST` passthrough — Paketo's run image
        // doesn't need it, but some buildpacks invoke docker themselves during build for sidecars.
        // We keep it off by default; enable if buildpacks require it.
        //
        // Output: final image is written via `-cache-image` + local export. For dev we want a local
        // image tag, so we rely on builder having `creator` that writes to the daemon we run against
        // when we mount the engine socket.
      ];

      // Socket mount: needed so the creator process inside the builder image can
      // push the resulting app image back into the host engine's image store.
      // Podman-private keeps its socket under XDG_RUNTIME_DIR inside private data dir.
      if (engine.name === 'podman-private') {
        const { privateDataDir } = await import('../engines/podman');
        const sockPaths = [
          join(privateDataDir(), 'podman', 'machine', 'vercel', 'podman.sock'),
          join(privateDataDir(), 'run', 'podman', 'podman.sock'),
        ];
        // Podman Machine (macOS) socket lives somewhere under privateDataDir.
        // Try a shallow search if fixed paths miss.
        let sock = sockPaths.find(p => {
          try {
            const { existsSync: ex } =
              require('node:fs') as typeof import('node:fs');
            return ex(p);
          } catch {
            return false;
          }
        });
        if (!sock) {
          try {
            const { readdirSync, existsSync: ex } = await import('node:fs');
            const base = join(privateDataDir(), 'podman', 'machine');
            if (ex(base)) {
              const entries = readdirSync(base);
              for (const e of entries) {
                const cand = join(base, e, 'podman.sock');
                if (ex(cand)) {
                  sock = cand;
                  break;
                }
              }
            }
          } catch {}
        }
        if (sock) {
          creatorArgs.push('-v', `${sock}:/run/podman/podman.sock`);
          creatorArgs.push('-e', 'DOCKER_HOST=unix:///run/podman/podman.sock');
        }
      } else if (engine.name === 'podman') {
        try {
          const { existsSync: ex } = await import('node:fs');
          const candidates = [
            `${process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`}/podman/podman.sock`,
            `${process.env.HOME}/.local/share/containers/podman/machine/podman.sock`,
          ];
          const sock = candidates.find(p => {
            try {
              return ex(p);
            } catch {
              return false;
            }
          });
          if (sock) {
            creatorArgs.push('-v', `${sock}:/run/podman/podman.sock`);
            creatorArgs.push(
              '-e',
              'DOCKER_HOST=unix:///run/podman/podman.sock'
            );
          }
        } catch {}
      } else {
        // docker-engine: mount docker.sock so creator can write final image to daemon
        const dockerSock = '/var/run/docker.sock';
        try {
          const { existsSync: ex } = await import('node:fs');
          if (ex(dockerSock)) {
            creatorArgs.push('-v', `${dockerSock}:/var/run/docker.sock`);
          }
        } catch {}
      }

      // The actual creator invocation inside the builder.
      creatorArgs.push(
        builder,
        '/cnb/lifecycle/creator',
        '-app=/workspace',
        '-cache-dir=/cache',
        // Launch cache dir defaults to /cache inside volume; reuse same volume for both.
        '-launch-cache-dir=/cache',
        // Previous image for restore/dedupe — intentionally omitted on first build,
        // lifecycle RESTORE will skip cleanly if not provided. We can add
        // `-skip-restore` on first build for speed later.
        params.tag
      );

      step(`Building with buildpacks (${builder}) → ${params.tag}`);
      try {
        await runEngine(engine, creatorArgs, out);
        done(`built ${params.tag} via buildpack lifecycle`);
      } catch (err) {
        const msg = (err as Error).message;
        // Provide actionable diagnostics for common failure modes.
        const hint = /no space left|disk quota/i.test(msg)
          ? `\n\nBuildpack builder cache volume "${cacheVol}" may be full. Try:\n  ${engine.name === 'docker' ? 'docker' : 'podman'} volume rm ${cacheVol}\n  and re-run vercel dev.`
          : /permission denied|socket/i.test(msg)
            ? `\n\nLifecycle could not write the image to the container engine.\nEnsure ${engine.name} is running and its socket is accessible, then re-run vercel dev.`
            : /detect.*fail|no.*buildpack.*detected/i.test(msg)
              ? `\n\nNo buildpack matched this project. Ensure it has a language marker (package.json, requirements.txt, go.mod, etc) or add a project.toml.\nAdd a Dockerfile to disable buildpack detection and use Docker instead.`
              : '';
        throw new Error(
          [
            `Buildpack build failed via lifecycle/creator (${builder}).`,
            '',
            `Command roughly: ${engine.name === 'docker' ? 'docker' : 'podman'} run --rm -v $PWD:/workspace ${builder} /cnb/lifecycle/creator -app=/workspace … ${params.tag}`,
            '',
            `Underlying error: ${msg}${hint}`,
            '',
            `Buildpack project is ${params.workPath}`,
            `To disable buildpacks for this project, add an empty Dockerfile.`,
          ].join('\n')
        );
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

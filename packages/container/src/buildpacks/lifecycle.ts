import type { Span } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import type { DevOutput } from '../dev';
import { debug, run, step, done, withSpan } from '../util';
import { builderImageRef } from './manifest';

/**
 * Build an app directory into an OCI image using lifecycle/creator inside the
 * Paketo builder image — no `pack` CLI, no host binary required.
 *
 * Requires Docker (mounts /var/run/docker.sock for --daemon export).
 */
export interface LifecycleBuildParams {
  workPath: string;
  tag: string;
  buildArgs?: Record<string, string>;
  builder?: string;
}

export interface LifecycleBuildResult {
  tag: string;
  builder: string;
}

export async function buildWithLifecycle(
  params: LifecycleBuildParams,
  out: DevOutput,
  span?: Span
): Promise<LifecycleBuildResult> {
  return withSpan(
    span,
    'container.buildpack.lifecycle_build',
    {
      'buildpack.builder': params.builder ?? builderImageRef(),
      'image.tag': params.tag,
    },
    async s => {
      const builder = params.builder ?? builderImageRef();

      step(`Pulling buildpack builder ${builder} (first run ~1.2GB, cached)`);
      try {
        await run('docker', ['pull', builder], { quiet: false });
        done(`builder ready: ${builder}`);
        s?.setAttributes({ 'buildpack.builder_pulled': 'true' });
      } catch (err) {
        debug(`builder pull failed (may be cached): ${(err as Error).message}`);
        s?.setAttributes({
          'buildpack.builder_pull_error': (err as Error).message,
        });
      }

      const envFlags: string[] = [];
      for (const [k, v] of Object.entries(params.buildArgs ?? {})) {
        envFlags.push('-e', `${k}=${v}`);
      }

      const dockerSock = '/var/run/docker.sock';
      const sockMount = existsSync(dockerSock)
        ? ['-v', `${dockerSock}:${dockerSock}`]
        : [];

      const creatorArgs = [
        'run',
        '--rm',
        ...envFlags,
        '-e',
        'CNB_PLATFORM_API=0.13',
        '-v',
        `${params.workPath}:/workspace`,
        ...sockMount,
        builder,
        '/cnb/lifecycle/creator',
        '-app=/workspace',
        '-skip-restore',
        '-daemon',
        params.tag,
      ];

      step(`Building with buildpacks (${builder}) -> ${params.tag}`);
      try {
        const { spawn } = await import('node:child_process');
        await new Promise<void>((resolve, reject) => {
          const child = spawn('docker', creatorArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          child.stdout?.on('data', (c: Buffer) => {
            if (out.onStdout) out.onStdout(c);
            else process.stderr.write(c.toString());
          });
          child.stderr?.on('data', (c: Buffer) => {
            if (out.onStderr) out.onStderr(c);
            else process.stderr.write(c.toString());
          });
          child.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ENOENT') {
              reject(
                new Error(
                  'Command not found: `docker`. Docker is required for buildpack-based container builds.'
                )
              );
              return;
            }
            reject(err);
          });
          child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`\`docker run\` exited with code ${code}`));
          });
        });

        done(`built ${params.tag} via buildpack lifecycle`);
      } catch (err) {
        const msg = (err as Error).message;
        const hint = /detect.*fail|no.*buildpack.*detected/i.test(msg)
          ? '\n\nNo buildpack matched this project. Ensure it has a PHP marker (composer.json, server.php, or index.php) or add a Dockerfile to use Docker instead.'
          : /no space left|disk quota/i.test(msg)
            ? '\n\nDocker may be out of disk space. Try `docker system prune`.'
            : '';
        throw new Error(
          [
            `Buildpack build failed via lifecycle/creator (${builder}).`,
            '',
            `Underlying error: ${msg}${hint}`,
            '',
            `Buildpack project is ${params.workPath}`,
            `To disable buildpacks, add a Dockerfile or unset VERCEL_BUILDPACKS.`,
          ].join('\n')
        );
      }

      return { tag: params.tag, builder };
    }
  );
}

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TARGET_PLATFORM } from '../../engines/types';
import { debug, done, run, step, withSpan } from '../../util';
import type { LifecycleRunner } from './lifecycle';
import {
  BUILD_USER,
  BUILD_GROUP_ID,
  BUILD_USER_ID,
  CNB_PLATFORM_API,
  creatorArgs,
  distributionUrls,
  fetchDistribution,
  lifecycleFailure,
  ORDER_MOUNT_DIR,
  readReportDigest,
  cnbRegistryAuth,
  writeOrderDir,
  writePlatformEnvDir,
} from './lifecycle';

/**
 * The Dockerfile for the local build image: the selected stock runtime image
 * plus the CNB user, mirroring the setup the production build container
 * performs with buildah. When the project needs Node.js for asset builds, the
 * official Node image's `/usr/local` (bin/node, bin/npm and its lib tree) is
 * copied to the toolchain home — build-only, since the exporter composes the
 * app image from the run image and layers, never from this build image.
 */
export function localBuildImageDockerfile(
  buildImage: string,
  nodeMajor?: number
): string {
  const lines: string[] = [];
  if (nodeMajor !== undefined) {
    lines.push(
      `FROM docker.io/library/node:${nodeMajor}-bookworm-slim AS node`
    );
  }
  lines.push(`FROM ${buildImage}`);
  if (nodeMajor !== undefined) {
    lines.push(`COPY --from=node /usr/local /node${nodeMajor}`);
  }
  lines.push(
    `RUN groupadd --gid ${BUILD_GROUP_ID} cnb ` +
      `&& useradd --create-home --uid ${BUILD_USER_ID} --gid ${BUILD_GROUP_ID} cnb ` +
      '&& mkdir -p /layers /platform /workspace ' +
      `&& chown -R ${BUILD_USER} /layers /workspace /home/cnb`
  );
  return `${lines.join('\n')}\n`;
}

/** Deterministic tag so the derived image is reused until its inputs change. */
export function localBuildImageTag(dockerfile: string): string {
  const hash = createHash('sha256').update(dockerfile).digest('hex');
  return `vercel-cnb-build:${hash.slice(0, 16)}`;
}

async function runDocker(
  args: string[],
  opts: { input?: string; env?: NodeJS.ProcessEnv; quiet?: boolean } = {}
): Promise<{ stdout: string; stderr: string }> {
  debug(`exec: docker ${args.join(' ')}`);
  return run('docker', args, opts);
}

/**
 * Build and publish a buildpack service with a local docker daemon: the
 * docker counterpart of `buildAndPushWithLifecycle`, and the local
 * `vercel build` path. The creator runs in a derived stock image and exports
 * straight to the registry, exactly as in production.
 */
export const buildAndPushWithLifecycleDocker: LifecycleRunner = async (
  buildpack,
  params,
  span
) => {
  const urls = distributionUrls(buildpack);
  return withSpan(
    span,
    'container.buildpack.lifecycle_docker_build',
    {
      'buildpack.runtime': buildpack.runtime,
      'buildpack.runtime_version': params.image.version,
      'buildpack.build_image': params.image.buildImage,
      'buildpack.run_image': params.image.runImage,
      'buildpack.lifecycle_url': urls.lifecycle,
      'buildpack.archive_url': urls.buildpacks.join(','),
      'buildpack.node_version': params.nodeToolchain?.version,
      'image.ref': params.imageRef,
    },
    async lifecycleSpan => {
      let stageDir: string | undefined;
      const containers: string[] = [];
      try {
        // Host scratch is CLI-only; cleanup never traverses engine-owned
        // workspace or layers, and no VM path sharing is needed.
        stageDir = mkdtempSync(join(tmpdir(), 'vercel-cnb-'));
        const cnbDir = join(stageDir, 'cnb');
        mkdirSync(cnbDir, { mode: 0o755 });
        const orderDir = writeOrderDir(buildpack, stageDir);
        const platformEnvDir = writePlatformEnvDir(
          params.buildEnv,
          {
            nodeHome: params.nodeToolchain?.home,
            entrypoint: params.entrypoint,
            command: params.command,
          },
          stageDir
        );

        step('Fetching the CNB lifecycle and buildpacks...');
        await fetchDistribution(buildpack, cnbDir);
        done('fetched the CNB lifecycle and buildpacks');
        const dockerfile = localBuildImageDockerfile(
          params.image.buildImage,
          params.nodeToolchain?.major
        );
        const buildImageTag = localBuildImageTag(dockerfile);
        const buildImageIdPath = join(stageDir, 'build-image.id');
        step(
          `Preparing ${buildpack.runtime} ${params.image.version} build image` +
            (params.nodeToolchain
              ? ` with Node.js ${params.nodeToolchain.major}`
              : '')
        );

        await runDocker(
          [
            'build',
            '--pull',
            '--platform',
            TARGET_PLATFORM,
            '--tag',
            buildImageTag,
            '--iidfile',
            buildImageIdPath,
            '-',
          ],
          { input: dockerfile }
        );
        // A concurrent build can rebind the cache tag after --pull. Use the
        // ID reported by this build, not an inspection of the shared tag.
        const buildImageId = readFileSync(buildImageIdPath, 'utf8').trim();
        if (!/^sha256:[a-f0-9]{64}$/.test(buildImageId)) {
          throw new Error('Docker build did not report a valid image ID.');
        }

        const containerName = `vercel-cnb-${buildpack.runtime}-${process.pid}-${randomBytes(8).toString('hex')}`;
        const initContainerName = `${containerName}-init`;
        // The initializer owns the anonymous volumes until both containers
        // are removed. No project code runs as root, and chown never follows
        // project symlinks into the image's toolchain or system files.
        containers.push(initContainerName);
        await runDocker([
          'create',
          '--name',
          initContainerName,
          '--platform',
          TARGET_PLATFORM,
          '--user',
          '0:0',
          '--network',
          'none',
          '--volume',
          '/workspace',
          '--volume',
          '/layers',
          '--volume',
          '/platform-output',
          '--volume',
          '/cnb',
          '--volume',
          '/platform',
          '--entrypoint',
          '/bin/sh',
          buildImageId,
          '-c',
          `chown -R -h ${BUILD_USER} /workspace /layers /platform-output ` +
            '&& chown -R -h 0:0 /cnb /platform',
        ]);
        step('Copying the project into the build workspace');
        await runDocker([
          'cp',
          `${params.workPath}/.`,
          `${initContainerName}:/workspace`,
        ]);
        // docker cp can retain host ownership. Initialize metadata ownership
        // explicitly, including when the host user happens to be uid 1001.
        for (const [source, destination] of [
          [`${cnbDir}/.`, '/cnb'],
          [orderDir, ORDER_MOUNT_DIR],
          [platformEnvDir, '/platform/env'],
        ]) {
          await runDocker([
            'cp',
            source,
            `${initContainerName}:${destination}`,
          ]);
        }
        await runDocker(['start', '--attach', initContainerName]);

        const lifecycleEnv: NodeJS.ProcessEnv = {
          ...process.env,
          CNB_REGISTRY_AUTH: cnbRegistryAuth(params.credentials),
        };

        containers.push(containerName);
        await runDocker(
          [
            'create',
            '--name',
            containerName,
            '--platform',
            TARGET_PLATFORM,
            '--user',
            BUILD_USER,
            '--env',
            'HOME=/home/cnb',
            '--env',
            `CNB_USER_ID=${BUILD_USER_ID}`,
            '--env',
            `CNB_GROUP_ID=${BUILD_GROUP_ID}`,
            '--env',
            `CNB_PLATFORM_API=${CNB_PLATFORM_API}`,
            '--env',
            'CNB_REGISTRY_AUTH',
            '--volumes-from',
            initContainerName,
            '--entrypoint',
            '/cnb/lifecycle/creator',
            buildImageId,
            ...creatorArgs(params.image, params.imageRef),
          ],
          { env: lifecycleEnv }
        );

        step(
          `Building and publishing ${params.imageRef} via Vercel ${buildpack.runtime} buildpacks`
        );
        await runDocker(['start', '--attach', containerName]);

        const reportPath = join(stageDir, 'report.toml');
        // Keep the stopped container and its volumes until the report file
        // is copied out; mutable directories never leave Docker storage.
        await runDocker([
          'cp',
          `${containerName}:/platform-output/report.toml`,
          reportPath,
        ]);
        const digest = readReportDigest(readFileSync(reportPath, 'utf8'));
        if (!digest) {
          throw new Error(
            `${buildpack.runtime} buildpack lifecycle did not report a digest.`
          );
        }

        done(`built and published ${params.imageRef}@${digest}`);
        lifecycleSpan?.setAttributes({ 'image.digest': digest });
        return {
          imageRef: params.imageRef,
          digest,
          buildImage: params.image.buildImage,
          runImage: params.image.runImage,
          runtimeVersion: params.image.version,
        };
      } catch (error) {
        throw lifecycleFailure(error, {
          buildpack,
          via: 'docker',
          buildImage: params.image.buildImage,
          workPath: params.workPath,
          span: lifecycleSpan,
        });
      } finally {
        // Remove the creator first, then the initializer's last reference
        // to the anonymous volumes. A failed create may still leave state.
        for (const container of containers.reverse()) {
          try {
            await runDocker(['rm', '--force', '--volumes', container], {
              quiet: true,
            });
          } catch {
            debug(`Could not remove Docker build container ${container}.`);
          }
        }
        if (stageDir) {
          try {
            rmSync(stageDir, { recursive: true, force: true });
          } catch {
            debug(
              `Could not remove Docker build scratch directory ${stageDir}.`
            );
          }
        }
      }
    }
  );
};

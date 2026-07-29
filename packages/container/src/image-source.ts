import type { BuildOptions } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BuildpackDescriptor } from './buildpacks/registry';
import { hasProjectMarkers, requestedBuildpack } from './buildpacks/registry';
import { findDockerfile, isDockerfileRef, readString } from './util';

/**
 * Where the container image for a service comes from. Computed identically
 * for the build path (`resolveImageHandler`) and the dev path
 * (`resolveDevImage`) so `vercel build` and `vercel dev` always agree; only
 * what the caller *does* with the decision differs.
 */
export type ImageSource =
  | {
      kind: 'dockerfile';
      /** Dockerfile path relative to `workPath`. May not exist on disk when
       * the entrypoint named it explicitly — callers surface that error at
       * the point they actually need the file. */
      dockerfileRel: string;
      dockerfilePath: string;
    }
  | { kind: 'prebuilt'; imageRef: string }
  | { kind: 'buildpack'; buildpack: BuildpackDescriptor };

export function resolveImageSource(
  options: Pick<BuildOptions, 'config' | 'workPath' | 'entrypoint'>,
  context: 'build' | 'dev'
): ImageSource {
  const { config, workPath, entrypoint } = options;
  const entrypointRef = readString(entrypoint);
  const buildpack = requestedBuildpack(config);

  // An entrypoint that names a Dockerfile (including the `Dockerfile.vercel` /
  // `Containerfile.vercel` opt-in markers) is built directly. Otherwise — e.g.
  // when a framework preset resolves its entrypoint via `<detect>` — discover
  // an opt-in marker in the work directory. A `Dockerfile.vercel` /
  // `Containerfile.vercel` marker takes precedence over a selected buildpack
  // (the opt-out from buildpack builds); a conventional `Dockerfile` does
  // not, so a repo can keep one for other purposes.
  const dockerfileConfigured =
    entrypointRef && isDockerfileRef(entrypointRef)
      ? entrypointRef
      : findDockerfile(workPath);
  const dockerfileRel = dockerfileConfigured ?? 'Dockerfile';
  const dockerfilePath = path.join(workPath, dockerfileRel);
  const hasDockerfile =
    dockerfileConfigured !== undefined ||
    (!buildpack && existsSync(dockerfilePath));
  if (hasDockerfile) {
    return { kind: 'dockerfile', dockerfileRel, dockerfilePath };
  }

  // `<detect>` is a sentinel from @vercel/fs-detectors meaning "no entrypoint
  // file — let the builder figure it out". It must never be treated as a
  // prebuilt OCI image reference.
  const isDetectSentinel = entrypointRef === '<detect>';
  const prebuiltImage =
    readString(config.handler) ??
    (isDetectSentinel ? undefined : entrypointRef);
  if (prebuiltImage) {
    return { kind: 'prebuilt', imageRef: prebuiltImage };
  }

  if (buildpack) {
    if (hasProjectMarkers(buildpack, workPath)) {
      return { kind: 'buildpack', buildpack };
    }
    throw new Error(
      `The ${buildpack.runtime} buildpack was selected, but no supported ` +
        `project marker was found in "${workPath}". Add ` +
        `${buildpack.projectMarkers.join(' or ')}, or add a Dockerfile.vercel ` +
        'to control the image build.'
    );
  }

  throw new Error(
    'Container service must specify an entrypoint: a prebuilt OCI image ' +
      'reference, or a Dockerfile path to ' +
      (context === 'dev' ? 'run with `vercel dev`.' : 'build.')
  );
}

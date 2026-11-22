import type { BuildOptions } from '@vercel/build-utils';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BuildpackRuntime } from './buildpacks/registry';
import { requestedBuildpack } from './buildpacks/registry';
import { findDockerfile, isDockerfileRef, readString } from './util';

/** The entrypoint `@vercel/fs-detectors` emits for platform-detected builds. */
const DETECT_SENTINEL = '<detect>';

/**
 * Where the container image for a service comes from. Shared by the build and
 * dev paths so `vercel build` and `vercel dev` always agree.
 */
export type ImageSource =
  | {
      kind: 'dockerfile';
      /** Relative to `workPath`; may not exist when named explicitly. */
      dockerfileRel: string;
      dockerfilePath: string;
    }
  | { kind: 'prebuilt'; imageRef: string }
  | { kind: 'buildpack'; buildpack: BuildpackRuntime };

export function resolveImageSource(
  options: Pick<BuildOptions, 'config' | 'workPath' | 'entrypoint'>,
  context: 'build' | 'dev'
): ImageSource {
  const { config, workPath, entrypoint } = options;
  const entrypointRef = readString(entrypoint);
  const isDetectSentinel = entrypointRef === DETECT_SENTINEL;

  // `config.buildpack` is an internal contract: project detection sets it
  // together with the `<detect>` entrypoint. A legacy `builds` entry passes
  // its matched file as the entrypoint instead, so it cannot select a
  // buildpack.
  const buildpack = requestedBuildpack(config);
  if (buildpack && !isDetectSentinel) {
    throw new Error(
      "Buildpack builds are selected by Vercel from the project's framework " +
        "or the service's runtime; `buildpack` is not a `builds` " +
        'configuration option.'
    );
  }
  // Daemon resolution already chose the source from the uploaded files.
  // An explicit program entrypoint also takes precedence over local markers.
  if (buildpack && (config.daemon || readString(config.buildpackEntrypoint))) {
    return { kind: 'buildpack', buildpack };
  }

  // An entrypoint that names a Dockerfile (including the `Dockerfile.vercel` /
  // `Containerfile.vercel` opt-in markers) is built directly. Otherwise — e.g.
  // when the entrypoint is the `<detect>` sentinel — discover an opt-in marker
  // in the work directory. `Dockerfile.vercel` takes precedence over a
  // selected buildpack (the opt-out); a conventional `Dockerfile` does not, so
  // a repo can keep one for other purposes.
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

  // The `<detect>` sentinel is never an image reference; `config.handler` is
  // the explicit prebuilt channel and wins even when a buildpack is selected.
  const prebuiltImage =
    readString(config.handler) ??
    (isDetectSentinel ? undefined : entrypointRef);
  if (prebuiltImage) {
    return { kind: 'prebuilt', imageRef: prebuiltImage };
  }

  if (buildpack) {
    // Validate markers only after the filtered source files are materialized.
    return { kind: 'buildpack', buildpack };
  }

  throw new Error(
    'Container service must specify an entrypoint: a prebuilt OCI image ' +
      'reference, or a Dockerfile path to ' +
      (context === 'dev' ? 'run with `vercel dev`.' : 'build.')
  );
}

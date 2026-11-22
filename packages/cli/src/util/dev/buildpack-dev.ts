import type { Builder, Service } from '@vercel/build-utils';
import { NowBuildError } from '@vercel/build-utils';
import { frameworkList } from '@vercel/frameworks';
import { getCommandName } from '../pkg-name';

export const BUILDPACK_DEV_UNSUPPORTED = 'BUILDPACK_DEV_UNSUPPORTED';

/**
 * The buildpack runtime a detected builder selects, if any. Project
 * detection sets `config.buildpack` together with the `<detect>` entrypoint
 * when a framework or service runtime builds a container image with
 * buildpacks instead of using its Lambda runtime.
 */
export function getBuildpackRuntime(
  builder: Pick<Builder, 'config'> | undefined
): string | undefined {
  const buildpack = builder?.config?.buildpack;
  return typeof buildpack === 'string' && buildpack.length > 0
    ? buildpack
    : undefined;
}

/**
 * The user-facing name of a runtime (`ruby` → `Ruby`). Buildpack runtimes
 * share their slug with a framework preset; fall back to the slug otherwise.
 */
function runtimeDisplayName(runtime: string): string {
  return frameworkList.find(f => f.slug === runtime)?.name ?? runtime;
}

/**
 * `vercel dev` has no way to run a buildpack-backed build yet, so a project
 * whose detection selects one cannot start.
 */
export function buildpackDevUnsupportedError(runtime: string): NowBuildError {
  return new NowBuildError({
    code: BUILDPACK_DEV_UNSUPPORTED,
    message: `${getCommandName('dev')} doesn't support ${runtimeDisplayName(
      runtime
    )} projects yet.`,
  });
}

/**
 * `vercel dev` has no way to run buildpack-backed services yet.
 */
export function buildpackServicesDevUnsupportedError(
  services: Array<{ name: string; runtime: string }>
): NowBuildError {
  const names = services.map(s => `"${s.name}"`);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const runtimes = [
    ...new Set(services.map(s => runtimeDisplayName(s.runtime))),
  ];
  const label = `${runtimes.join(' and ')} ${names.length === 1 ? 'service' : 'services'}`;
  return new NowBuildError({
    code: BUILDPACK_DEV_UNSUPPORTED,
    message: `${getCommandName('dev')} doesn't support the ${label} ${list} yet.`,
  });
}

/**
 * Fail fast, before any service starts, when a service builds with a
 * buildpack: nothing in `vercel dev` can run it yet.
 */
export function assertNoBuildpackServices(services: Service[]): void {
  const blocked: Array<{ name: string; runtime: string }> = [];
  for (const service of services) {
    const runtime = getBuildpackRuntime(service.builder);
    if (runtime) {
      blocked.push({ name: service.name, runtime });
    }
  }
  if (blocked.length > 0) {
    throw buildpackServicesDevUnsupportedError(blocked);
  }
}

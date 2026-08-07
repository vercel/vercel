import path from 'path';
import type {
  ExperimentalService,
  ExperimentalServiceV2,
} from '@vercel/fs-detectors';
import type { Builder, DevSidecar } from '@vercel/build-utils';
import { importBuilders } from '../build/import-builders';

type OrchestratorSidecar = ExperimentalService & { consumer?: string };

export function toOrchestratorService(
  sidecar: DevSidecar
): OrchestratorSidecar {
  const { type: _type, ...subscriber } = sidecar;
  return {
    ...subscriber,
    schema: 'experimentalServices',
    type: 'worker',
    trigger: 'queue',
  };
}

export async function collectBuilderDevSidecars({
  builds,
  workPath,
  services = [],
}: {
  builds: Builder[];
  workPath: string;
  services?: ExperimentalServiceV2[];
}): Promise<DevSidecar[]> {
  const builderSpecs = new Set(builds.map(build => build.use));
  const buildersWithPkgs = await importBuilders(builderSpecs, workPath);
  const servicesByBuilder = new Map(
    services.map(service => [service.builder, service])
  );

  const nestedSidecars = await Promise.all(
    builds.map(async build => {
      const builder = buildersWithPkgs.get(build.use)?.builder;
      if (!builder) {
        throw new Error(`Failed to load Builder "${build.use}"`);
      }

      const service = servicesByBuilder.get(build);
      const serviceRoot = service?.root ?? '.';
      const sidecars =
        (await builder.getDevSidecars?.({
          workPath: path.join(workPath, serviceRoot),
          build,
          ...(service ? { service } : {}),
        })) ?? [];

      return service
        ? sidecars.map(sidecar => ({
            ...sidecar,
            // Process names must be project-wide unique. Keep the consumer
            // name unchanged so local delivery matches the deployment build.
            name: `${service.name}-${sidecar.name}`,
            workspace: serviceRoot,
          }))
        : sidecars;
    })
  );
  const sidecars = nestedSidecars.flat();

  const names = new Set<string>();
  for (const sidecar of sidecars) {
    const { name, type } = sidecar as { name: string; type: string };
    if (type !== 'subscriber') {
      throw new Error(
        `Development sidecar "${name}" has unsupported type "${type}"`
      );
    }
    if (names.has(name)) {
      throw new Error(
        `Multiple builders contributed a development sidecar named "${name}"`
      );
    }
    names.add(name);
  }

  return sidecars;
}

import type { ExperimentalService } from '@vercel/fs-detectors';
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
}: {
  builds: Builder[];
  workPath: string;
}): Promise<DevSidecar[]> {
  const builderSpecs = new Set(builds.map(build => build.use));
  const buildersWithPkgs = await importBuilders(builderSpecs, workPath);

  const nestedSidecars = await Promise.all(
    builds.map(build => {
      const builder = buildersWithPkgs.get(build.use)?.builder;
      if (!builder) {
        throw new Error(`Failed to load Builder "${build.use}"`);
      }
      return builder.getDevSidecars?.({ workPath, build }) ?? [];
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

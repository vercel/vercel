import { join } from 'path';
import {
  FileBlob,
  downloadFile,
  isExperimentalService,
  isExperimentalServiceV2,
  type DeployManifestBuild,
  type DeployManifestService,
  type DiagnosticsValues,
  type Files,
  type PackageManifest,
  type Service,
} from '@vercel/build-utils';
import { getRuntimeFramework } from '@vercel-internals/runtimes/framework';

export async function writeManifests(
  packageManifests: Array<{
    workspace: string;
    key: string;
    diagnosticsValues?: DiagnosticsValues;
    manifest: PackageManifest;
    service?: Service;
    builderUse: string;
  }>,
  diagnostics: Files,
  ops: Promise<Error | void>[],
  outputDir: string
): Promise<void> {
  if (packageManifests.length === 0) return;

  const projectManifest: Record<string, unknown> = {};
  const deployManifestBuilds: Record<string, DeployManifestBuild> = {};
  const deployManifestServices: Record<string, DeployManifestService> = {};

  for (const {
    workspace,
    diagnosticsValues,
    manifest,
    service,
    builderUse,
  } of packageManifests) {
    const key = `${builderUse}:${workspace}`;
    const framework = diagnosticsValues?.framework ?? manifest.framework;
    projectManifest[key] = {
      ...manifest,
      workspace,
      builder: builderUse,
      framework,
      serviceName: service?.name,
      serviceType:
        service && isExperimentalService(service) ? service.type : undefined,
      routePrefix:
        service && isExperimentalService(service)
          ? service.routePrefix
          : undefined,
    };
    const { version: _version, ...manifestWithoutVersion } = manifest;
    deployManifestBuilds[key] = {
      ...manifestWithoutVersion,
      framework,
      root: workspace,
      builder: builderUse,
    };

    if (service) {
      const existing = deployManifestServices[service.name];
      if (existing) {
        existing.builds.push(key);
      } else {
        deployManifestServices[service.name] = {
          builds: [key],
          bindings: isExperimentalServiceV2(service)
            ? service.bindings
            : undefined,
        };
      }
    }
  }

  if (Object.keys(projectManifest).length === 0) return;

  const projectManifestBlob = new FileBlob({
    data: JSON.stringify(projectManifest),
  });
  diagnostics['project-manifest.json'] = projectManifestBlob;
  ops.push(
    downloadFile(
      projectManifestBlob,
      join(outputDir, 'diagnostics', 'project-manifest.json')
    ).then(
      () => undefined,
      err => err
    )
  );

  const deployManifestBlob = new FileBlob({
    data: JSON.stringify({
      manifestVersion: '2.0',
      builds: deployManifestBuilds,
      services: deployManifestServices,
    }),
  });
  diagnostics['deploy-manifest.json'] = deployManifestBlob;
  ops.push(
    downloadFile(
      deployManifestBlob,
      join(outputDir, 'diagnostics', 'deploy-manifest.json')
    ).then(
      () => undefined,
      err => err
    )
  );
}

/**
 * Framework the CLI asks a builder to report.
 */
export function getBuildDiagnosticsFramework({
  service,
  configFramework,
  apiDirFramework,
}: {
  service: Service | undefined;
  configFramework: string | null | undefined;
  apiDirFramework: string | undefined;
}): string | undefined {
  return (
    service?.framework ??
    // Filter out the services preset. Services projects receive it as `config.framework`,
    // but it is not the build's framework.
    (configFramework === 'services' ? undefined : configFramework) ??
    // Services without a framework report their runtime's preset (e.g. "python").
    getRuntimeFramework(service?.runtime) ??
    apiDirFramework
  );
}

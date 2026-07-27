import { join } from 'path';
import {
  FileBlob,
  downloadFile,
  isExperimentalService,
  isExperimentalServiceV2,
  type Config,
  type DeployManifestBuild,
  type DeployManifestService,
  type Files,
  type PackageManifest,
  type Service,
} from '@vercel/build-utils';

export async function writeManifests(
  packageManifests: Array<{
    workspace: string;
    key: string;
    buildConfig: Config;
    manifest: Record<string, unknown>;
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
    buildConfig,
    manifest,
    service,
    builderUse,
  } of packageManifests) {
    const key = `${builderUse}:${workspace}`;
    projectManifest[key] = {
      ...manifest,
      workspace,
      builder: builderUse,
      framework: service?.framework ?? buildConfig.framework,
      serviceName: service?.name,
      serviceType:
        service && isExperimentalService(service) ? service.type : undefined,
      routePrefix:
        service && isExperimentalService(service)
          ? service.routePrefix
          : undefined,
    };
    const { version: _version, ...manifestWithoutVersion } =
      manifest as unknown as PackageManifest;
    deployManifestBuilds[key] = {
      ...manifestWithoutVersion,
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

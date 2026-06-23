import { join } from 'path';
import {
  FileBlob,
  downloadFile,
  isExperimentalService,
  type Config,
  type DeployManifestBuild,
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
    deployManifestBuilds[key] = {
      ...(manifest as unknown as PackageManifest),
      root: workspace,
      builder: builderUse,
    };
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

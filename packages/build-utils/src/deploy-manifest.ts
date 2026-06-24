import type { PackageManifest } from './package-manifest';

export interface DeployManifestBuild extends PackageManifest {
  root: string;
  builder: string;
}

export interface DeployManifest {
  manifestVersion: '2.0';
  builds: Record<string, DeployManifestBuild>;
}

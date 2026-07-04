import type { PackageManifest } from './package-manifest';
import type { ServiceBinding } from './types';

export interface DeployManifestBuild extends Omit<PackageManifest, 'version'> {
  root: string;
  builder: string;
}

export interface DeployManifestService {
  builds: string[];
  bindings?: ServiceBinding[];
}

export interface DeployManifest {
  manifestVersion: '2.0';
  builds: Record<string, DeployManifestBuild>;
  services?: Record<string, DeployManifestService>;
}

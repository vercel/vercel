import fs from 'fs';
import { join, dirname } from 'path';
import FileBlob from './file-blob';
import type { Files, Diagnostics, BuildOptions } from './types';

export interface PackageManifestDependency {
  name: string;
  type: 'direct' | 'transitive' | 'peer';
  scopes: string[];
  requested?: string;
  resolved: string;
  source?: string;
  sourceUrl?: string;
}

export interface PackageManifest {
  version?: string;
  runtime: string;
  framework?: string;
  runtimeVersion?: {
    requested?: string;
    requestedSource?: string;
    resolved: string;
  };
  dependencies: PackageManifestDependency[];
}

export const MANIFEST_VERSION = '20260304';
export const MANIFEST_FILENAME = 'package-manifest.json';

export function manifestPath(runtime: string): string {
  return join('.vercel', runtime, MANIFEST_FILENAME);
}

export async function writeProjectManifest(
  manifest: PackageManifest,
  workPath: string,
  runtime: string
): Promise<void> {
  const outPath = join(workPath, manifestPath(runtime));
  await fs.promises.mkdir(dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, JSON.stringify(manifest, null, 2));
}

export function createDiagnostics(runtime: string): Diagnostics {
  return async ({ workPath }: BuildOptions): Promise<Files> => {
    try {
      const filePath = join(workPath, manifestPath(runtime));
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return {
        [MANIFEST_FILENAME]: new FileBlob({ data }),
      };
    } catch {
      return {};
    }
  };
}

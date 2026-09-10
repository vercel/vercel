import {
  writeProjectManifest,
  createDiagnostics,
  MANIFEST_VERSION,
  type PackageManifest,
} from '@vercel/build-utils';

export async function generateProjectManifest({
  workPath,
  framework,
  serviceType,
}: {
  workPath: string;
  framework?: string | null;
  serviceType?: string | null;
}): Promise<void> {
  try {
    const manifest: PackageManifest = {
      version: MANIFEST_VERSION,
      runtime: 'container',
      ...(framework ? { framework } : {}),
      ...(serviceType ? { serviceType } : {}),
      dependencies: [],
    };
    await writeProjectManifest(manifest, workPath, 'container');
  } catch {
    // Never throw — build must succeed
  }
}

export const diagnostics = createDiagnostics('container');

import { createDiagnostics } from '@vercel/build-utils';
import type { NodeVersion } from '@vercel/build-utils';

type CliType = 'yarn' | 'npm' | 'pnpm' | 'bun' | 'vlt';

export async function generateProjectManifest(_args: {
  workPath: string;
  entrypointDir: string;
  nodeVersion: NodeVersion;
  cliType: CliType;
  lockfilePath: string | undefined;
  lockfileVersion: number | undefined;
}): Promise<void> {}

export const diagnostics = createDiagnostics('node');

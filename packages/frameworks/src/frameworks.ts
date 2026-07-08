import { join } from 'path';
import { readFileSync } from 'fs';
import type { Framework } from './types';
import {
  createFrameworks,
  type FrameworkManifestEntry,
  type FrameworkRuntimeOverrides,
} from './manifest';

export * from './types';
export * from './manifest';

function loadPinnedManifest(): readonly FrameworkManifestEntry[] {
  const path = join(__dirname, 'frameworks.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to load the pinned frameworks manifest at "${path}". It is fetched at build time — run \`pnpm build\` in packages/frameworks. ${error}`
    );
  }
}

export const frameworksManifest: readonly FrameworkManifestEntry[] =
  loadPinnedManifest();

export const frameworkRuntimeOverrides: Record<
  string,
  FrameworkRuntimeOverrides
> = {
  container: {
    getOutputDirName: async () => 'public',
  },
  storybook: {
    detectionConfidence: 'weak',
  },
};

export const frameworks: readonly Framework[] = createFrameworks(
  frameworkRuntimeOverrides,
  frameworksManifest
);

export const frameworkList: readonly Framework[] = frameworks;
export default frameworkList;

import { join } from 'path';
import { readFileSync } from 'fs';
import type { Framework } from './types';
import {
  createFrameworks,
  type FrameworkManifestEntry,
  type FrameworkRuntimeOverrides,
} from './manifest';
import {
  resolveFrameworkList,
  type ResolvedFrameworkList,
  type ResolveFrameworkListOptions,
} from './resolve';

export * from './types';
export * from './manifest';
export * from './resolve';

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

/**
 * The pinned frameworks manifest, fetched from the frameworks API at build
 * time (see build.mjs).
 */
export const frameworksManifest: readonly FrameworkManifestEntry[] =
  loadPinnedManifest();

/**
 * Runtime overrides keyed by framework slug, for behavior that cannot be
 * expressed as a manifest descriptor. Overrides win over the manifest.
 */
export const frameworkRuntimeOverrides: Record<
  string,
  FrameworkRuntimeOverrides
> = {
  container: {
    getOutputDirName: async () => 'public',
  },
  storybook: {
    // Storybook is commonly a devDependency of apps that deploy something
    // else. Remove once the manifest carries this field.
    detectionConfidence: 'weak',
  },
};

export const frameworks: readonly Framework[] = createFrameworks(
  frameworkRuntimeOverrides,
  frameworksManifest
);

/**
 * Resolves the framework list, preferring the remote manifest (with a local
 * cache) over the pinned one. Presets this CLI version cannot build are
 * returned in `requiresUpdate` so callers can prompt the user to upgrade.
 */
export async function resolveFrameworks(
  options: Omit<
    ResolveFrameworkListOptions,
    'pinnedManifest' | 'overrides'
  > = {}
): Promise<ResolvedFrameworkList> {
  return resolveFrameworkList({
    ...options,
    pinnedManifest: frameworksManifest,
    overrides: frameworkRuntimeOverrides,
  });
}

export const frameworkList: readonly Framework[] = frameworks;
export default frameworkList;

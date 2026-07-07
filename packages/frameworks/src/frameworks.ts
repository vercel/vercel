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
import manifest from './frameworks.json';

export * from './types';
export * from './manifest';
export * from './resolve';

/**
 * The pinned frameworks manifest, refreshed from the frameworks API at
 * build time (see build.mjs) and checked into git.
 */
export const frameworksManifest =
  manifest as unknown as readonly FrameworkManifestEntry[];

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

import type { Framework } from './types';
import {
  createFrameworks,
  type FrameworkManifestEntry,
  type FrameworkRuntimeOverrides,
} from './manifest';

export * from './types';
export * from './manifest';

// Fetched at build time by build.mjs. `require` (rather than fs) so that
// bundlers inline it when this package is bundled into builders.
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const frameworksManifest: readonly FrameworkManifestEntry[] = require('./frameworks.json');

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

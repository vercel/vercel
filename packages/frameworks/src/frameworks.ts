import type { Framework } from './types';
import { interpretManifest, type FrameworkManifest } from './interpret';
// `frameworks.json` does not exist in a fresh checkout: it is written into
// `src/` at build time by `build.mjs` (fetched from the frameworks API) and is
// gitignored. A static import (rather than a runtime `readFileSync`) is
// essential so that esbuild inlines the manifest when `@vercel/frameworks` is
// bundled into consumers (e.g. `@vercel/static-build`, `@vercel/cli`), which do
// not ship a sibling `frameworks.json` for a runtime read to find.
import manifest from './frameworks.json';

export * from './types';
export {
  interpretFramework,
  interpretManifest,
  type FrameworkDescriptor,
  type FrameworkManifest,
  type OutputDirName,
  type GatsbyDefaultRoutes,
} from './interpret';
export {
  getFrameworkList,
  FRAMEWORKS_MANIFEST_URL,
  type GetFrameworkListOptions,
} from './get-framework-list';

/**
 * The framework list is sourced from the frameworks API at build time (written
 * to `src/frameworks.json` by `build.mjs`, and inlined here by esbuild) and
 * interpreted into runtime {@link Framework} objects. The API manifest is the
 * single source of truth; there is no committed copy in `src/`.
 *
 * For a fresher list fetched at call time (same interpreted shape), use
 * {@link getFrameworkList}. The sync export remains the default for consumers
 * that must not introduce a network dependency at module load.
 *
 * Please note that it is extremely important that the `dependency` property
 * needs to reference a CLI. This is needed because you might want (for
 * example) a Gatsby site that is powered by Preact, so you can't look for the
 * `preact` dependency. Instead, you need to look for `preact-cli` when
 * optimizing Preact CLI projects.
 */
export const frameworkList: readonly Framework[] = interpretManifest(
  manifest as unknown as FrameworkManifest
);

export const frameworks = frameworkList;
export default frameworkList;

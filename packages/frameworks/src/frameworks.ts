import type { Framework } from './types';
import { interpretManifest, type FrameworkManifest } from './interpret';
import manifest from './frameworks.json';

export * from './types';
export {
  interpretFramework,
  interpretManifest,
  type FrameworkDescriptor,
  type FrameworkManifest,
} from './interpret';

/**
 * The framework list is compiled at build time from `frameworks.json` (the
 * pinned manifest shipped in `dist/`) and interpreted into runtime
 * {@link Framework} objects. `frameworks.json` is the hardcoded
 * representation guaranteed to exist without any network access; a future
 * step sources it from the frameworks API at build time while keeping this
 * committed copy as the fallback.
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

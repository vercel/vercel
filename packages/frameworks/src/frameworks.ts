import { readFileSync } from 'fs';
import { join } from 'path';
import type { Framework } from './types';
import { interpretManifest, type FrameworkManifest } from './interpret';

export * from './types';
export {
  interpretFramework,
  interpretManifest,
  type FrameworkDescriptor,
  type FrameworkManifest,
  type OutputDirName,
  type GatsbyDefaultRoutes,
} from './interpret';

/**
 * Loads the serialized framework manifest that `build.mjs` fetches from the
 * frameworks API (`/v1/frameworks.json`) and writes into `dist/`.
 *
 * The manifest is intentionally *not* imported statically: it does not exist
 * in `src/` and is produced only at build time. When this module runs from its
 * compiled location the JSON is a sibling in `dist/`; when it runs from `src/`
 * (unit tests, which run after `build`) `dist/` is a sibling directory.
 */
function loadManifest(): FrameworkManifest {
  const candidates = [
    join(__dirname, 'frameworks.json'),
    join(__dirname, '..', 'dist', 'frameworks.json'),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')) as FrameworkManifest;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }
  throw new Error(
    `Could not find "frameworks.json"; run \`pnpm build\` in packages/frameworks first (looked in: ${candidates.join(
      ', '
    )})`
  );
}

/**
 * The framework list is sourced from the frameworks API at build time (written
 * to `dist/frameworks.json` by `build.mjs`) and interpreted into runtime
 * {@link Framework} objects. The API manifest is the single source of truth;
 * there is no committed copy in `src/`.
 *
 * Please note that it is extremely important that the `dependency` property
 * needs to reference a CLI. This is needed because you might want (for
 * example) a Gatsby site that is powered by Preact, so you can't look for the
 * `preact` dependency. Instead, you need to look for `preact-cli` when
 * optimizing Preact CLI projects.
 */
export const frameworkList: readonly Framework[] = interpretManifest(
  loadManifest()
);

export const frameworks = frameworkList;
export default frameworkList;

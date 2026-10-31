import {
  createImportBuilders,
  formatResolvedBuilders,
  getBuildersDir,
  type BuilderWithPkg,
} from '@vercel-internals/builder-orchestration/import-builders';
import * as staticBuilder from './static-builder';
import { VERCEL_DIR } from '../util/projects/link';
import output from '../output-manager';
import cliPkg from '../util/pkg';
import { installBuilders } from './install-builders';
import { isManagedBuildersInstall } from '../util/native-install';
import { createRequire } from 'module';
import {
  loadEmbeddedBuilderGraphs,
  loadEmbeddedBuilderIndex,
} from './vlt-builder-graph';
import { partitionBuilderSpecs } from './vlt-builder-routing';
import { isAbsolute, join } from 'path';

// Get a real `require()` reference that esbuild won't mutate. When the CLI is
// bundled, this resolves Builders relative to the CLI's own dist directory.
const require_ = createRequire(__filename);

export type { BuilderWithPkg };
export { formatResolvedBuilders, getBuildersDir };

const builderPins = cliPkg.builders ?? {};
const managedBuilderNames = new Set(Object.keys(builderPins));

const legacyImportBuilders = createImportBuilders({
  builderPins,
  // Explicit and custom specs retain the project-local legacy cache. The
  // configured Builders directory is a VLT cache root for managed specs.
  buildersDir: (cwd, vercelDir = VERCEL_DIR) =>
    join(cwd, vercelDir, 'builders'),
  debug: (message: string) => output.debug(message),
  installBuilders,
  isNativeBinaryInstall: isManagedBuildersInstall,
  require: require_,
  staticBuilder,
  vercelDir: VERCEL_DIR,
});

export type VltPreloadState = 'notStarted' | 'inFlight' | 'done' | 'failed';

let vltImports:
  | Promise<
      [
        typeof import('./vlt-builder-importer'),
        Awaited<ReturnType<typeof loadEmbeddedBuilderIndex>>,
      ]
    >
  | undefined;
let vltPreload: Promise<void> | undefined;
let vltPreloadState: VltPreloadState = 'notStarted';

// The loaded imports stay cached for the life of the process so a build after
// the preload never starts a second load. Only a failed load is retried.
// Only the small Builder index is loaded up front; the full graphs are loaded
// when a Builder is missing from the cache and has to be installed.
function loadVltImports() {
  if (!vltImports) {
    const imports = Promise.all([
      import('./vlt-builder-importer'),
      loadEmbeddedBuilderIndex(),
    ]);
    vltImports = imports;
    imports.catch(() => {
      if (vltImports === imports) vltImports = undefined;
    });
  }
  return vltImports;
}

export function getVltPreloadState(): VltPreloadState {
  return vltPreloadState;
}

// The native build worker starts this in the background once it is ready; a
// build that needs vlt meanwhile awaits the same in-flight load.
export function preloadVltBuilderImports(): Promise<void> {
  vltPreload ??= (async () => {
    vltPreloadState = 'inFlight';
    try {
      await loadVltImports();
      vltPreloadState = 'done';
    } catch (error: unknown) {
      vltPreloadState = 'failed';
      throw error;
    }
  })();
  return vltPreload;
}

export async function importBuilders(
  builderSpecs: Set<string>,
  cwd: string,
  span?: Parameters<typeof legacyImportBuilders>[2]
): Promise<Map<string, BuilderWithPkg>> {
  const managedBuilders = isManagedBuildersInstall();
  const buildersDir = managedBuilders
    ? process.env.VERCEL_BUILDERS_DIR
    : undefined;
  if (buildersDir && !isAbsolute(buildersDir)) {
    throw new Error('VERCEL_BUILDERS_DIR must be an absolute path.');
  }

  if (!managedBuilders) {
    return legacyImportBuilders(builderSpecs, cwd, span);
  }

  const { managed, legacy } = partitionBuilderSpecs(
    builderSpecs,
    managedBuilderNames
  );
  if (buildersDir && managed.size > 0) {
    span?.setAttributes({
      'builders.directory.enabled': 'true',
      'builders.directory.path': getBuildersDir(cwd),
    });
  }
  output.debug(
    `Builder import routing: vlt=[${[...managed].map(([spec]) => spec).join(', ')}], legacy=[${[...legacy].join(', ')}]`
  );

  if (managed.size === 0) {
    return legacyImportBuilders(legacy, cwd, span);
  }

  const preloadState = vltPreloadState;
  const loadStartedAt = performance.now();
  const [{ createVltBuilderImporter }, index] = await loadVltImports();
  span?.setAttributes({
    'builders.vlt.preloadState': preloadState,
    'builders.vlt.preloadAwaitMs': String(
      Math.round(performance.now() - loadStartedAt)
    ),
  });
  const vltImportBuilders = createVltBuilderImporter({
    loadIndex: async () => index,
    loadGraphs: () => loadEmbeddedBuilderGraphs(),
    require: require_,
    cacheRoot: buildersDir ? getBuildersDir(cwd) : undefined,
    debug: message => output.debug(message),
  });
  const [vltBuilders, legacyBuilders] = await Promise.all([
    vltImportBuilders(managed, span),
    legacy.size
      ? legacyImportBuilders(legacy, cwd, span)
      : Promise.resolve(new Map<string, BuilderWithPkg>()),
  ]);
  return new Map([...vltBuilders, ...legacyBuilders]);
}

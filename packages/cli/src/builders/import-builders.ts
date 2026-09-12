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
import { isNativeBinaryInstall } from '../util/native-install';
import { createRequire } from 'module';
import { loadEmbeddedBuilderGraphs } from './vlt-builder-graph';
import { partitionBuilderSpecs } from './vlt-builder-routing';

// Get a real `require()` reference that esbuild won't mutate. When the CLI is
// bundled, this resolves Builders relative to the CLI's own dist directory.
const require_ = createRequire(__filename);

export type { BuilderWithPkg };
export { formatResolvedBuilders, getBuildersDir };

const legacyImportBuilders = createImportBuilders({
  builderPins: cliPkg.builders ?? {},
  debug: message => output.debug(message),
  installBuilders,
  isNativeBinaryInstall,
  require: require_,
  staticBuilder,
  vercelDir: VERCEL_DIR,
});

const managedBuilderNames = new Set(Object.keys(cliPkg.builders ?? {}));

export async function importBuilders(
  builderSpecs: Set<string>,
  cwd: string,
  span?: Parameters<typeof legacyImportBuilders>[2]
): Promise<Map<string, BuilderWithPkg>> {
  if (
    !isNativeBinaryInstall() ||
    process.env.VERCEL_EXPERIMENTAL_VLT_BUILDERS !== '1'
  ) {
    return legacyImportBuilders(builderSpecs, cwd, span);
  }

  const { managed, legacy } = partitionBuilderSpecs(
    builderSpecs,
    managedBuilderNames
  );
  output.debug(
    `Builder import routing: vlt=[${[...managed].map(([spec]) => spec).join(', ')}], legacy=[${[...legacy].join(', ')}]`
  );

  if (managed.size === 0) {
    return legacyImportBuilders(legacy, cwd, span);
  }

  const [{ createVltBuilderImporter }, graphs] = await Promise.all([
    import('./vlt-builder-importer'),
    loadEmbeddedBuilderGraphs(),
  ]);
  const vltImportBuilders = createVltBuilderImporter({
    loadGraphs: async () => graphs,
    require: require_,
    debug: message => output.debug(message),
  });
  const [vltBuilders, legacyBuilders] = await Promise.all([
    vltImportBuilders(managed),
    legacy.size
      ? legacyImportBuilders(legacy, cwd, span)
      : Promise.resolve(new Map<string, BuilderWithPkg>()),
  ]);
  return new Map([...vltBuilders, ...legacyBuilders]);
}

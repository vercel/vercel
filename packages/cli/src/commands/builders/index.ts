import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { isManagedBuildersInstall } from '../../util/native-install';
import { buildersCommand, preinstallSubcommand } from './command';

const require_ = createRequire(__filename);

const COMMAND_CONFIG = {
  preinstall: getCommandAliases(preinstallSubcommand),
};

export default async function builders(client: Client): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(buildersCommand.options),
      { permissive: true }
    );
  } catch (error: unknown) {
    printError(error);
    return 2;
  }

  const { subcommand, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  if (subcommand !== 'preinstall' || args.length > 0) {
    output.error('Only `vercel builders preinstall` is supported.');
    return 2;
  }

  if (!isManagedBuildersInstall()) {
    output.error(
      'Builder preinstallation requires the native Vercel CLI or VERCEL_CLI_MANAGED_BUILDERS=1.'
    );
    return 1;
  }

  const configuredCacheRoot = process.env.VERCEL_BUILDERS_DIR;
  if (!configuredCacheRoot) {
    output.error('Set VERCEL_BUILDERS_DIR to preinstall Builders.');
    return 1;
  }

  if (!isAbsolute(configuredCacheRoot)) {
    output.error('VERCEL_BUILDERS_DIR must be an absolute path.');
    return 1;
  }
  const cacheRoot = configuredCacheRoot;

  try {
    const [{ loadEmbeddedBuilderGraphs }, { createVltBuilderImporter }] =
      await Promise.all([
        import('../../builders/vlt-builder-graph'),
        import('../../builders/vlt-builder-importer'),
      ]);
    const graphs = await loadEmbeddedBuilderGraphs();
    const specs = new Map(
      Object.keys(graphs.builders).map(name => [name, name] as const)
    );
    const importBuilders = createVltBuilderImporter({
      graphs,
      require: require_,
      cacheRoot,
      debug: message => output.debug(message),
    });

    const loadedBuilders = await importBuilders(specs);
    const missingBuilders = [...specs.keys()].filter(
      spec => !loadedBuilders.has(spec)
    );
    if (missingBuilders.length > 0) {
      throw new Error(
        `Failed to load preinstalled Builders: ${missingBuilders.join(', ')}`
      );
    }
    output.log(`Preinstalled ${loadedBuilders.size} Builders in ${cacheRoot}`);
    return 0;
  } catch (error: unknown) {
    printError(error);
    return 1;
  }
}

import { Output } from '../output';
import * as ERRORS from '../../util/errors-ts';
import getConfig from '../../util/get-config';

export default async function getInferredTargets(output: Output, localConfigPath: string) {
  // Read the configuration file from the best guessed location
  const config = await getConfig(output, localConfigPath);
  if (
    config instanceof ERRORS.CantParseJSONFile ||
    config instanceof ERRORS.CantFindConfig
  ) {
    return config;
  }

  // This field is deprecated, warn about it
  if (config.aliases) {
    output.warn('The `aliases` field has been deprecated in favor of `alias`');
  }

  // The aliases can be stored in both aliases or alias
  const aliases = config.aliases || config.alias;
  if (!aliases) {
    return new ERRORS.NoAliasInConfig();
  }

  // Check the type for the option aliases
  if (typeof aliases !== 'string' && !Array.isArray(aliases)) {
    return new ERRORS.InvalidAliasInConfig(aliases);
  }

  // Always resolve with an array
  return typeof aliases === 'string' ? [aliases] : aliases;
}

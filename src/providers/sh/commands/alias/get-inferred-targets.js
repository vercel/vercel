// @flow
import getConfig from './get-config'
import { Output } from './types'
import { NoAliasInConfig, InvalidAliasInConfig, CantParseJSONFile, CantFindConfig } from './errors'

async function getInferredTargets(output: Output, localConfigPath: string | void) {
  // Read the configuration file from the best guessed location
  const config = await getConfig(output, localConfigPath);
  if ((config instanceof CantParseJSONFile) || (config instanceof CantFindConfig)) {
    return config
  }

  // This field is deprecated, warn about it
  if (config.aliases) {
    output.warn('The `aliases` field has been deprecated in favor of `alias`');
  }

  // The aliases can be stored in both aliases or alias
  const aliases = config.aliases || config.alias
  if (!aliases) {
    return new NoAliasInConfig()
  }

  // Check the type for the option aliases
  if (typeof aliases !== 'string' && !Array.isArray(aliases)) {
    return new InvalidAliasInConfig(aliases)
  }

  // Always resolve with an array
  return typeof aliases === 'string' ? [aliases] : aliases
}

export default getInferredTargets

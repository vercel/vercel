// @flow
import toHost from '../../util/to-host'

import { Output } from '../../util/types'
import * as Errors from '../../util/errors'
import getInferredTargets from './get-inferred-targets'
import isValidDomain from '../../util/domains/is-valid-domain'

async function getTargetsForAlias(output: Output, args: string[], localConfigPath?: string | void) {
  const targets = await getTargets(output, args, localConfigPath)
  if (
    (targets instanceof Errors.CantParseJSONFile) ||
    (targets instanceof Errors.CantFindConfig) ||
    (targets instanceof Errors.NoAliasInConfig) ||
    (targets instanceof Errors.InvalidAliasInConfig)
  ) {
    return targets
  }
  
  // Append zeit if needed or convert to host in case is a full URL
  const hostTargets: string[] = targets.map(target => {
    return target.indexOf('.') === -1
      ? `${target}.now.sh`
      : toHost(target)
  })

  // Validate the targets
  for (const target of hostTargets) {
    if (!isValidDomain(target)) {
      return new Errors.InvalidAliasTarget(target)
    }
  }

  return hostTargets
}

async function getTargets(output: Output, args: string[], localConfigPath: string | void) {
  return args.length === 0
    ? getInferredTargets(output, localConfigPath)
    : [args[args.length - 1]]
}

export default getTargetsForAlias

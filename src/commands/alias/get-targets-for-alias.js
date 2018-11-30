//      
import toHost from '../../util/to-host';

import * as Errors from '../../util/errors';
import getInferredTargets from './get-inferred-targets';

async function getTargetsForAlias(
  output        ,
  args          ,
  localConfigPath                
) {
  const targets = await getTargets(output, args, localConfigPath);
  if (
    targets instanceof Errors.CantParseJSONFile ||
    targets instanceof Errors.CantFindConfig ||
    targets instanceof Errors.NoAliasInConfig ||
    targets instanceof Errors.InvalidAliasInConfig
  ) {
    return targets;
  }

  const hostTargets           = targets.map(target => target.indexOf('.') !== -1 ? toHost(target) : target);

  return hostTargets;
}

async function getTargets(
  output        ,
  args          ,
  localConfigPath               
) {
  return args.length === 0
    ? getInferredTargets(output, localConfigPath)
    : [args[args.length - 1]];
}

export default getTargetsForAlias;

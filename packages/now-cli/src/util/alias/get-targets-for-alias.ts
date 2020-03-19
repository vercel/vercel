import toHost from '../to-host';
import { Config } from '../../types';
import * as ERRORS from '../errors-ts';

export function getTargetsForAlias(args: string[], { alias }: Config) {
  if (args.length) {
    return targetsToHosts([args[args.length - 1]]);
  }

  if (!alias) {
    return new ERRORS.NoAliasInConfig();
  }

  // Check the type for the option aliases
  if (typeof alias !== 'string' && !Array.isArray(alias)) {
    return new ERRORS.InvalidAliasInConfig(alias);
  }

  return typeof alias === 'string' ? [alias] : alias;
}

function targetsToHosts(targets: string[]) {
  return targets.map(targetToHost).filter(item => item) as string[];
}

function targetToHost(target: string) {
  return target.indexOf('.') !== -1 ? toHost(target) : target;
}

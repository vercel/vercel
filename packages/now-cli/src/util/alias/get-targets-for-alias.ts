import { NowError } from '../now-error';
import { Output } from '../output';
import getInferredTargets from './get-inferred-targets';
import toHost from '../to-host';
import { Config } from '../../types';

export default async function getTargetsForAlias(
  output: Output,
  args: string[],
  localConfig: Config
) {
  const targets = await getTargets(output, args, localConfig);
  return targets instanceof NowError ? targets : targetsToHosts(targets);
}

function targetsToHosts(targets: string[]) {
  return targets.map(targetToHost).filter(item => item) as string[];
}

function targetToHost(target: string) {
  return target.indexOf('.') !== -1 ? toHost(target) : target;
}

async function getTargets(
  output: Output,
  args: string[],
  localConfig: Config
) {
  return args.length === 0
    ? getInferredTargets(output, localConfig)
    : [args[args.length - 1]];
}

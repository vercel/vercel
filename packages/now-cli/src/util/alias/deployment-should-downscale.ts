import deploymentIsAliased from './deployment-is-aliased';
import { Output } from '../output';
import Client from '../client';
import getScaleForDC from '../scale/get-scale-for-dc';
import { Deployment } from '../../types';

export default async function deploymentShouldDownscale(
  output: Output,
  client: Client,
  deployment: Deployment
) {
  const isAliased = await deploymentIsAliased(client, deployment);
  output.debug(`Previous deployment is aliased: ${isAliased.toString()}`);

  if (
    (deployment.type === 'DOCKER' && !!deployment.slot) ||
    deployment.version === 2 ||
    deployment.type === 'STATIC'
  ) {
    // Don't downscale a previous slot or builds deployment
    return false;
  }

  return (
    !isAliased &&
    Object.keys(deployment.scale).reduce(
      (result, dc) =>
        result ||
        getScaleForDC(dc, deployment).min !== 0 ||
        getScaleForDC(dc, deployment).max !== 1,
      false
    )
  );
}

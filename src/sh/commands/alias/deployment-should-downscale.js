// @flow
import { Output, Now } from '../../util/types'
import type { NpmDeployment, DockerDeployment } from '../../util/types'
import deploymentIsAliased from './deployment-is-aliased'
import getScaleForDC from './get-scale-for-dc'

async function deploymentShouldDownscale(output: Output, now: Now, deployment: NpmDeployment | DockerDeployment) {
  const isAliased = await deploymentIsAliased(now, deployment)
  output.debug(`Previous deployment is aliased: ${isAliased.toString()}`)
  if (deployment.type === 'DOCKER' && !!deployment.slot) {
    // Don't downscale a previous slot deployment
    return false;
  }
  return !isAliased && Object.keys(deployment.scale).reduce((result, dc) => {
    return result || getScaleForDC(dc, deployment).min !== 0 ||
      getScaleForDC(dc, deployment).max !== 1
  }, false)
}

export default deploymentShouldDownscale

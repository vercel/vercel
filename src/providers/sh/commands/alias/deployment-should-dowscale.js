// @flow
import { Now } from './types'
import type { NpmDeployment, BinaryDeployment } from './types'
import deploymentIsAliased from './deployment-is-aliased'
import getScaleForDC from './get-scale-for-dc'

function deploymentShouldDowscale(now: Now, deployment: NpmDeployment | BinaryDeployment): boolean {
  return !deploymentIsAliased(now, deployment) && Object.keys(deployment.scale).reduce((result, dc) => {
    return result || getScaleForDC(dc, deployment).min !== 0 ||
      getScaleForDC(dc, deployment).max !== 1
  }, false)
}

export default deploymentShouldDowscale

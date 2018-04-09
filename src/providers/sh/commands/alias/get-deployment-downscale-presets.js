// @flow
import type { NpmDeployment, BinaryDeployment, DeploymentScale } from './types'

function getDeploymentDownscalePresets(deployment: NpmDeployment | BinaryDeployment): DeploymentScale {
  return Object.keys(deployment.scale).reduce((result, dc) => {
    return Object.assign(result, {
      [dc]: { min: 0, max: 1 }
    })
  }, {})
}

export default getDeploymentDownscalePresets

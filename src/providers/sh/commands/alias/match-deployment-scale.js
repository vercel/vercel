// @flow
import { Output, Now } from '../../util/types'
import type { DeploymentScale } from '../../util/types'
import getDeploymentInstances from './get-deployment-instances'

const AUTO = 'auto'

async function matchDeploymentScale(output: Output, now: Now, deploymentId: string, scale: DeploymentScale) {
  const currentInstances = await getDeploymentInstances(now, deploymentId)
  const dcsToScale = new Set(Object.keys(scale))
  const matches: Map<string, number> = new Map()

  for (const dc of dcsToScale) {
    const currentScale = currentInstances[dc]
    if (!currentScale) {
      output.debug(`Still no data for DC ${dc}`)
      break;
    }

    const currentInstancesCount = currentScale.instances.length
    const { min, max } = scale[dc]
    if (isInstanceCountBetween(currentInstancesCount, min, max)) {
      matches.set(dc, currentInstancesCount)
      output.debug(`DC ${dc} matched scale.`)
    } else {
      output.debug(`DC ${dc} missing scale. Inteded (${min}, ${max}). Current ${currentInstancesCount}`)
    }
  }

  return matches
}

function isInstanceCountBetween(value: number, min: number, max: number) {
  const safeMax = max === AUTO ? Infinity : max
  return value >= min && value <= safeMax
}

export default matchDeploymentScale

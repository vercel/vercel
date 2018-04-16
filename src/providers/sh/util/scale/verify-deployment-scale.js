// @flow
import ms from 'ms'
import createPollingFn from '../../../../util/create-polling-fn'
import { Now } from '../types'
import { VerifyScaleTimeout } from '../errors'
import getDeploymentInstances from '../deploy/get-deployment-instances'
import type { InstancesCount, DeploymentScale } from '../types'

type Options = {
  timeout?: number,
  pollingInterval?: number,
}

async function* verifyDeploymentScale(
  now: Now,
  deploymentId: string,
  scale: DeploymentScale,
  options: Options = {}
): AsyncGenerator<[string, number] | VerifyScaleTimeout, void, void> {
  const { timeout = ms('3m') } = options
  const { pollingInterval = 1000 } = options
  const getPollDeploymentInstances = createPollingFn(getDeploymentInstances, pollingInterval)
  const pollDeploymentInstances = getPollDeploymentInstances(now, deploymentId)
  const currentInstancesCount = getInitialInstancesCountForScale(scale)
  const targetInstancesCount = getTargetInstancesCountForScale(scale)
  const startTime = Date.now()

  for await (const instances of pollDeploymentInstances) {
    if (Date.now() - startTime > timeout) {
      yield new VerifyScaleTimeout(timeout)
      break
    }

    // For each instance we update the current count and yield a match if ready
    for (const dc of Object.keys(instances)) {
      if (instances[dc].instances.length > currentInstancesCount[dc]) {
        currentInstancesCount[dc] = instances[dc].instances.length
        if (currentInstancesCount[dc] >= targetInstancesCount[dc]) {
          yield [dc, currentInstancesCount[dc]]
        }
      }
    }

    // If all dcs are matched, finish the generator
    if (allDcsMatched(targetInstancesCount, currentInstancesCount)) {
      break
    }
  }
}

function allDcsMatched(target: InstancesCount, current: InstancesCount): boolean {
  return Object.keys(target).reduce((result, dc) => (
    result && current[dc] >= target[dc]
  ), true)
}

function getTargetInstancesCountForScale(scale: DeploymentScale): InstancesCount {
  return Object.keys(scale).reduce((result, dc) =>({ 
    ...result, [dc]: scale[dc].max 
  }), {})
}

function getInitialInstancesCountForScale(scale: DeploymentScale): InstancesCount {
  return Object.keys(scale).reduce((result, dc) => ({
    ...result, [dc]: 0
  }), {})
}

export default verifyDeploymentScale

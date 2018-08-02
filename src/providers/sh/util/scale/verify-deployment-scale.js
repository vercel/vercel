// @flow
import ms from 'ms'
import uuid from '../../util/uuid'
import createPollingFn from '../../../../util/create-polling-fn'
import returnify from '../../../../util/returnify-async-generator.js'
import { Output, Now } from '../types'
import { VerifyScaleTimeout } from '../errors'
import getDeploymentInstances from '../deploy/get-deployment-instances'
import type { InstancesCount, DeploymentScale } from '../types'

type Options = {
  timeout?: number,
  pollingInterval?: number,
}

async function* verifyDeploymentScale(
  output: Output,
  now: Now,
  deploymentId: string,
  scale: DeploymentScale,
  options: Options = {}
): AsyncGenerator<[string, number] | VerifyScaleTimeout, void, void> {
  const { timeout = ms('3m') } = options
  const { pollingInterval = 5000 } = options
  const getPollDeploymentInstances = createPollingFn(getDeploymentInstances, pollingInterval)
  const pollDeploymentInstances = returnify(getPollDeploymentInstances(now, deploymentId, uuid()))
  const currentInstancesCount = getInitialInstancesCountForScale(scale)
  const targetInstancesCount = getTargetInstancesCountForScale(scale)
  const startTime = Date.now()
  output.debug(`Verifying scale minimum presets to ${JSON.stringify(targetInstancesCount)}`)

  for await (const [err, instances] of pollDeploymentInstances) {
    if (Date.now() - startTime > timeout) {
      yield new VerifyScaleTimeout(timeout)
      break
    }

    if (err) {
      // These ResponseErrors aren't typed yet :(
      // $FlowFixMe
      if (err.status === 412) {
        continue;
      } else {
        throw err
      }
    } else if (instances) { // HACK because of https://github.com/facebook/flow/issues/6676
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
}

function allDcsMatched(target: InstancesCount, current: InstancesCount): boolean {
  return Object.keys(target).reduce((result, dc) => (
    result && current[dc] >= target[dc]
  ), true)
}

function getTargetInstancesCountForScale(scale: DeploymentScale): InstancesCount {
  return Object.keys(scale).reduce((result, dc) =>({
    ...result, [dc]: Math.min(Math.max(scale[dc].min, 1), scale[dc].max)
  }), {})
}

function getInitialInstancesCountForScale(scale: DeploymentScale): InstancesCount {
  return Object.keys(scale).reduce((result, dc) => ({
    ...result, [dc]: 0
  }), {})
}

export default verifyDeploymentScale

// @flow
import { Now } from '../../util/types'
import createPollingFn from '../../../../util/create-polling-fn'
import { DeploymentPermissionDenied, DeploymentNotFound } from '../errors'
import type { Deployment, StateChangeEvent } from '../types'
import getDeploymentByIdOrHost from './get-deployment-by-id-or-host'

async function* getStatusChangeFromPolling(now: Now, contextName: string, idOrHost: string): AsyncGenerator<StateChangeEvent, void, void> {
  const pollDeployment = createPollingFn(getDeploymentOrFail, 1000)
  let lastResult: Deployment | null = null
  for await (const deployment of pollDeployment(now, contextName, idOrHost)) {
    if (lastResult && lastResult.state !== deployment.state) {
      yield {
        type: 'state-change',
        created: Date.now(),
        payload: { value: deployment.state }
      }
    } else {
      lastResult = deployment
    }
  }
}

async function getDeploymentOrFail(now: Now, contextName: string, idOrHost: string) {
  const deployment = await getDeploymentByIdOrHost(now, contextName, idOrHost)
  if ((deployment instanceof DeploymentPermissionDenied) || (deployment instanceof DeploymentNotFound)) {
    throw deployment
  } else {
    return deployment
  }
}

export default getStatusChangeFromPolling

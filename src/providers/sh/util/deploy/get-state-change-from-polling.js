// @flow
import { Now } from '../../util/types'
import createPollingFn from '../../../../util/create-polling-fn'
import type { Deployment, StateChangeEvent } from '../types'
import getDeploymentByIdOrThrow from './get-deployment-by-id-or-throw'

async function* getStatusChangeFromPolling(now: Now, contextName: string, idOrHost: string): AsyncGenerator<StateChangeEvent, void, void> {
  const pollDeployment = createPollingFn(getDeploymentByIdOrThrow, 1000)
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

export default getStatusChangeFromPolling

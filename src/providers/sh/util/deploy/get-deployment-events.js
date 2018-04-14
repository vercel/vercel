// @flow
import jsonlines from 'jsonlines'
import { stringify } from 'querystring'
import type { Readable } from 'stream'

import { Now } from '../../util/types'
import combineAsyncGenerators from '../../../../util/combine-async-generators'
import createPollingFn from '../../../../util/create-polling-fn'
import eventListenerToGenerator from '../../../../util/event-listener-to-generator'
import type { Deployment, DeploymentEvent, StateChangeEvent } from '../types'
import { DeploymentPermissionDenied, DeploymentNotFound } from '../errors'
import getDeploymentByIdOrHost from './get-deployment-by-id-or-host'

type Options = {
  direction: 'forward' | 'backwards',
  follow: boolean,
  format?: 'lines',
  instanceId?: string,
  limit?: number,
  query?: string,
  since?: number,
  types?: string[],
  until?: number,
}

export default async function getDeploymentEvents(now: Now, contextName: string, idOrHost: string, options: Options) {
  const eventsStream = await getEventsStream(now, idOrHost, options)
  const eventsStreamGenerator: AsyncGenerator<DeploymentEvent, void, void> = eventListenerToGenerator('data', eventsStream)
  const eventsFromPollingGenerator = getStatusChangeFromPolling(now, contextName, idOrHost)
  return combineAsyncGenerators(eventsStreamGenerator, eventsFromPollingGenerator)
}

async function getEventsStream(now: Now, idOrHost: string, options: Options): Promise<Readable> {
  const response = await now.fetch(`/v2/now/deployments/${idOrHost}/events?${stringify({
    direction: options.direction,
    follow: options.follow ? '1' : '',
    format: options.format || 'lines',
    instanceId: options.instanceId,
    limit: options.limit,
    q: options.query,
    since: options.since,
    types: (options.types || []).join(','),
    until: options.until
  })}`)
  const stream = response.readable ? await response.readable() : response.body
  return stream.pipe(jsonlines.parse())
}

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
      break
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

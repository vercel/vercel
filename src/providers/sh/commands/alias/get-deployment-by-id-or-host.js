// @flow
import chalk from 'chalk'
import toHost from '../../util/to-host'
import wait from '../../../../util/output/wait'

import { Output, Now } from './types'
import type { Deployment } from './types'
import { DeploymentNotFound, DeploymentPermissionDenied } from './errors'

async function getDeploymentByIdOrHost(output: Output, now: Now, contextName: string, idOrHost: string) {
  const cancelWait = wait(`Fetching deployment "${idOrHost}" in ${chalk.bold(contextName)}`);
  try {
    const { deployment } = idOrHost.indexOf('.') !== -1
      ? await getDeploymentByHost(output, now, toHost(idOrHost))
      : await getDeploymentById(output, now, idOrHost)
    cancelWait()
    return deployment
  } catch (error) {
    cancelWait()
    if (error.status === 404) {
      return new DeploymentNotFound(idOrHost, contextName)
    } else if (error.status === 403) {
      return new DeploymentPermissionDenied(idOrHost, contextName)
    } else {
      throw error;
    }
  }
}

async function getDeploymentById(output: Output, now: Now, id: string): Promise<{ deployment: Deployment }> {
  const deployment = await now.fetch(`/v3/now/deployments/${encodeURIComponent(id)}`)
  return { deployment }
}

type DeploymentHostResponse = {
  deployment: {
    id: string
  }
}

async function getDeploymentByHost(output: Output, now: Now, host: string): Promise<{ deployment: Deployment }> {
  const response: DeploymentHostResponse = await now.fetch(`/v3/now/hosts/${encodeURIComponent(host)}?resolve=1`)
  return getDeploymentById(output, now, response.deployment.id)
}

export default getDeploymentByIdOrHost

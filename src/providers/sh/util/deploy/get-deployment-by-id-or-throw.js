// @flow
import { Now } from '../types'
import { DeploymentPermissionDenied, DeploymentNotFound } from '../errors'
import getDeploymentByIdOrHost from './get-deployment-by-id-or-host'

async function getDeploymentOrFail(now: Now, contextName: string, idOrHost: string) {
  const deployment = await getDeploymentByIdOrHost(now, contextName, idOrHost)
  if ((deployment instanceof DeploymentPermissionDenied) || (deployment instanceof DeploymentNotFound)) {
    throw deployment
  } else {
    return deployment
  }
}

export default getDeploymentOrFail

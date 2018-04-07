// @flow
import { Output, Now } from './types'
import type { Alias, Deployment } from './types'
import fetchDeployment from './get-deployment'

async function fetchDeploymentFromAlias(
  output: Output, 
  now: Now, 
  contextName: string, 
  prevAlias: Alias | void,
  currentDeployment: Deployment
) {
  return (prevAlias && prevAlias.deploymentId !== currentDeployment.uid)
    ? fetchDeployment(output, now, contextName, prevAlias.deploymentId)
    : null
}

export default fetchDeploymentFromAlias

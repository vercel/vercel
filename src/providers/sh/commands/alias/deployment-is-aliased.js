// @flow
import { Now } from './types'
import type { Deployment } from './types'

async function deploymentIsAliased(now: Now, deployment: Deployment) {
  const aliases = await now.listAliases()
  return aliases.some(alias => alias.deploymentId === deployment.uid)
}

export default deploymentIsAliased

// @flow
import { Now } from './types'
import type { Alias, Deployment } from './types'

async function deploymentIsAliased(now: Now, deployment: Deployment) {
  const aliases: Array<Alias> = await now.listAliases()
  return aliases.some(alias => alias.deploymentId === deployment.uid)
}

export default deploymentIsAliased

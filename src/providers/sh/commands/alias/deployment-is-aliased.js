// @flow
import { Now } from '../../util/types'
import type { Deployment } from '../../util/types'

async function deploymentIsAliased(now: Now, deployment: Deployment) {
  const aliases = await now.listAliases()
  return aliases.some(alias => alias.deploymentId === deployment.uid)
}

export default deploymentIsAliased

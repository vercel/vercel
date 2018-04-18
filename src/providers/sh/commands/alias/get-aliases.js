// @flow
import { Now } from '../../util/types'
import type { AliasListItem } from '../../util/types'

async function getAliases(now: Now, deploymentId?: string): Promise<Array<AliasListItem>> {
  const payload = await now.fetch(deploymentId
    ? `/now/deployments/${deploymentId}/aliases`
    : '/now/aliases')
  return payload.aliases || []
}

export default getAliases 

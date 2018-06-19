// @flow
import { Output, Now } from '../types'

async function removeDomainByName(output: Output, now: Now, domain: string) {
  return now.fetch(`/domains/${domain}`, { method: 'DELETE' })
}

export default removeDomainByName;

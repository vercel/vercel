// @flow
import qs from 'querystring'
import { Now } from '../../util/types'

type DomainStatus = {
  available: boolean,
}

async function getDomainStatus(now: Now, domain: string): Promise<DomainStatus> {
  return await now.fetch(`/domains/status?${qs.stringify({ name: domain })}`)
}

export default getDomainStatus

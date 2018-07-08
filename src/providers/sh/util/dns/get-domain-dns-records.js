// @flow
import { Now, Output } from '../../util/types'
import { DomainNotFound } from '../../util/errors'
import type { DNSRecord } from '../../util/types'

async function getDomainDNSRecords(output: Output, now: Now, domain: string) {
  output.debug(`Fetching for DNS records of domain ${domain}`)
  try {
    const payload = await now.fetch(`/v3/domains/${encodeURIComponent(domain)}/records`)
    return (payload.records: DNSRecord[])
  } catch (error) {
    if (error.code === 'not_found') {
      return new DomainNotFound(domain)
    }
    throw error
  }
}

export default getDomainDNSRecords

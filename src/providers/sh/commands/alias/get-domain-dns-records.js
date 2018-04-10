// @flow
import { Now, Output } from '../../util/types'
import type { DNSRecord } from '../../util/types'

async function getDomainDNSRecords(output: Output, now: Now, domain: string) {
  output.debug(`Fetching for DNS records of domain ${domain}`)
  const payload = await now.fetch(`/domains/${encodeURIComponent(domain)}/records`)
  const records: DNSRecord[] = payload.records
  return records
}

export default getDomainDNSRecords

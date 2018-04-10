// @flow
import { Now, Output } from '../../util/types'
import { DNSPermissionDenied } from '../../util/errors'
import type { DNSRecordType } from '../../util/types'

async function setupDNSRecord(output: Output, now: Now, type: DNSRecordType, name: string, domain: string, value: string) {
  output.debug(`Trying to setup ${type} record with name ${name} for domain ${domain}`)
  try {
    await now.fetch(`/domains/${domain}/records`, {
      body: { type, name, value },
      method: 'POST'
    })
  } catch (error) {
    if (error.status === 403) {
      return new DNSPermissionDenied(domain)
    }

    if (error.status !== 409) {
      // ignore the record conflict to make it idempotent
      throw error
    }
  }
}

export default setupDNSRecord

// @flow
import { Now, Output } from './types'
import { DNSPermissionDenied } from './errors'

type DNSRecord = 'ALIAS' | 'CNAME'

async function setupDNSRecords(output: Output, now: Now, alias: string, domain: string) {
  const cnameResult = await setupDNSRecord(output, now, 'CNAME', '*', domain)
  if (cnameResult instanceof DNSPermissionDenied) {
    return cnameResult
  }

  const aliasResult = await setupDNSRecord(output, now, 'ALIAS', '', domain)
  if (aliasResult instanceof DNSPermissionDenied) {
    return aliasResult
  }
}

async function setupDNSRecord(output: Output, now: Now, type: DNSRecord, name: string, domain: string) {
  output.debug(`Trying to setup ${type} record with name ${name} for domain ${domain}`)
  try {
    await now.fetch(`/domains/${domain}/records`, {
      body: { type, name, value: 'alias.zeit.co' },
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

export default setupDNSRecords

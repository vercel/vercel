// @flow
import { Now, Output } from '../../util/types'
import { DNSPermissionDenied } from '../../util/errors'
import getDomainDNSRecords from './get-domain-dns-records'
import setupDNSRecord from './setup-dns-record'

const ALIAS_ZEIT = 'alias.zeit.co'
const ALIAS_ZEIT_RECORD = 'alias.zeit.co.'

async function maybeSetupDNSRecords(output: Output, now: Now, domain: string, subdomain: string | null) {
  const records = await getDomainDNSRecords(output, now, domain)

   // Find all the ALIAS records and if there is a collision flat that root is misconfigured
  const aliasRecords = records.filter(record => record.type === 'ALIAS')
  if (aliasRecords.length === 0 || !aliasRecords.find(record => record.name === '' && record.value !== ALIAS_ZEIT_RECORD)) {
    const aliasResult = await setupDNSRecord(output, now, 'ALIAS', '', domain, ALIAS_ZEIT)
    if (aliasResult instanceof DNSPermissionDenied) {
      return aliasResult
    }
  }

  // Find all CNAME records and if there are no collisions configure, otherwise flag as misconfigured
  const cnameRecords = records.filter(record => record.type === 'CNAME')
  if (cnameRecords.length === 0) {
    const cnameResult = await setupDNSRecord(output, now, 'CNAME', '*', domain, ALIAS_ZEIT)
    if (cnameResult instanceof DNSPermissionDenied) {
      return cnameResult
    }
  } else if (subdomain) {
    if (
      !cnameRecords.find(record => record.name === '*' && record.value !== ALIAS_ZEIT_RECORD) &&
      !cnameRecords.find(record => record.name === subdomain && record.value !== ALIAS_ZEIT_RECORD)
    ) {
      const cnameResult = await setupDNSRecord(output, now, 'CNAME', subdomain, domain, ALIAS_ZEIT)
      if (cnameResult instanceof DNSPermissionDenied) {
        return cnameResult
      }
    }
  }
}

export default maybeSetupDNSRecords

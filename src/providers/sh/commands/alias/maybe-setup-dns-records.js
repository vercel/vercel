// @flow
import { Now, Output } from '../../util/types'
import { DNSPermissionDenied } from '../../util/errors'
import getDomainDNSRecords from './get-domain-dns-records'
import setupDNSRecord from './setup-dns-record'

async function maybeSetupDNSRecords(output: Output, now: Now, alias: string, domain: string, subdomain: string) {
  const records = await getDomainDNSRecords(output, now, domain)

  // If there is no ALIAS DNS record we set one up
  if (!records.find(record => record.type === 'ALIAS')) {
    const aliasResult = await setupDNSRecord(output, now, 'ALIAS', '', domain)
    if (aliasResult instanceof DNSPermissionDenied) {
      return aliasResult
    }
  }

  const cnameRecords = records.filter(record => record.type === 'CNAME')
  if (cnameRecords.length === 0) {
    // If there are no CNAME records, add one with the wildcard
    const cnameResult = await setupDNSRecord(output, now, 'CNAME', '*', domain)
    if (cnameResult instanceof DNSPermissionDenied) {
      return cnameResult
    }
  } else if (subdomain && !cnameRecords.find(record => record.name === '*')) {
    // If there are CNAME records but not with * we should add one for subdomain
    const cnameResult = await setupDNSRecord(output, now, 'CNAME', subdomain, domain)
    if (cnameResult instanceof DNSPermissionDenied) {
      return cnameResult
    }
  }
}

export default maybeSetupDNSRecords

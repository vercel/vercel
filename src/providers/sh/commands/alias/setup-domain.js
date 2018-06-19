// @flow
import chalk from 'chalk'
import psl from 'psl'

// Internal utils
import getDomainInfo from './get-domain-info'
import getDomainNameservers from './get-domain-nameservers'
import maybeSetupDNSRecords from './maybe-setup-dns-records'
import verifyDomain from '../../util/domains/verify-domain'

// Types and errors
import { Output, Now } from '../../util/types'
import * as Errors from '../../util/errors'

async function setupDomain(output: Output, now: Now, alias: string, contextName: string) {
  const { domain, subdomain }: { domain: string, subdomain: string | null } = psl.parse(alias)
  const info = await getDomainInfo(now, domain, contextName)
  if (info instanceof Errors.DomainPermissionDenied) {
    return info
  }

  if (!info) {
    output.debug(`Domain is unknown for ZEIT World`)
    // If we have no info it means that it's an unknown domain. We have to check the
    // nameservers to register and verify it as an external or non-external domain
    const nameservers = await getDomainNameservers(now, domain)
    if (nameservers instanceof Errors.DomainNameserversNotFound) {
      return nameservers
    }

    output.log(
      `Nameservers: ${nameservers && nameservers.length
        ? nameservers.map(ns => chalk.underline(ns)).join(', ')
        : chalk.dim('none')}`
    )

    if (!nameservers.every(ns => ns.endsWith('.zeit.world'))) {
      // If it doesn't have the nameserver pointing to now we have to create the
      // domain knowing that it should be verified via a DNS TXT record.
      const verified = await verifyDomain(now, alias, contextName, { isExternal: true })
      if (
        (verified instanceof Errors.DomainNotVerified) ||
        (verified instanceof Errors.DomainPermissionDenied) ||
        (verified instanceof Errors.DomainVerificationFailed) ||
        (verified instanceof Errors.NeedUpgrade)
      ) {
        return verified
      } else {
        output.success(`Domain ${domain} added!`)
      }
    } else {
      // We have to create the domain knowing that the nameservers are zeit.world
      output.debug(`Detected ${chalk.bold(chalk.underline('zeit.world'))} nameservers! Setting up domain...`)
      const verified = await verifyDomain(now, alias, contextName, { isExternal: false })
      if (
        (verified instanceof Errors.DomainNotVerified) ||
        (verified instanceof Errors.DomainPermissionDenied) ||
        (verified instanceof Errors.DomainVerificationFailed) ||
        (verified instanceof Errors.NeedUpgrade)
      ) {
        return verified
      } else {
        output.success(`Domain ${domain} added!`)
      }

      // Since it's pointing to our nameservers we can configure the DNS records
      const result = await maybeSetupDNSRecords(output, now, domain, subdomain)
      if ((result instanceof Errors.DNSPermissionDenied)) {
        return result
      }
    }
  } else {
    // If we have records from the domain we have to try to verify in case it is not
    // verified and from this point we can be sure about its verification
    output.debug(`Domain is known for ZEIT World`)
    if (!info.verified) {
      const verified = await verifyDomain(now, alias, contextName, { isExternal: info.isExternal })
      if (
        (verified instanceof Errors.DomainNotVerified) ||
        (verified instanceof Errors.DomainPermissionDenied) ||
        (verified instanceof Errors.DomainVerificationFailed) ||
        (verified instanceof Errors.NeedUpgrade)
      ) {
        return verified
      }
    }

    if (!info.isExternal) {
      // Make sure that the DNS records are configured without messing with existent records
      const result = await maybeSetupDNSRecords(output, now, domain, subdomain)
      if ((result instanceof Errors.DNSPermissionDenied)) {
        return result
      }
    }
  }
}

export default setupDomain

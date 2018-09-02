// @flow
import chalk from 'chalk'
import psl from 'psl'

// Internal utils
import getDomainInfo from './get-domain-info'
import purchaseDomainIfAvailable from './purchase-domain-if-available'
import getDomainNameservers from '../../util/domains/get-domain-nameservers'
import verifyDomain from '../../util/domains/verify-domain'

// Types and errors
import { Output, Now } from '../../util/types'
import * as Errors from '../../util/errors'

async function setupDomain(output: Output, now: Now, alias: string, contextName: string) {
  const { domain }: { domain: string, subdomain: string | null } = psl.parse(alias)
  const info = await getDomainInfo(now, domain, contextName)
  if (info instanceof Errors.DomainPermissionDenied) {
    return info
  }

  if (!info) {
    output.debug(`Domain is unknown for ZEIT World`)
    const nameservers = await getDomainNameservers(now, domain)

    // If we find nameservers we have to try to add the domain
    if (!(nameservers instanceof Errors.DomainNameserversNotFound)) {
      output.log(
        `Nameservers: ${nameservers && nameservers.length
          ? nameservers.map(ns => chalk.underline(ns)).join(', ')
          : chalk.dim('none')}`
      )

      const domainPointsToZeitWorld = nameservers.every(ns => ns.endsWith('.zeit.world'));
      const verified = await verifyDomain(now, domain, contextName, { isExternal: !domainPointsToZeitWorld })
      if (
        (verified instanceof Errors.DomainNotVerified) ||
        (verified instanceof Errors.DomainPermissionDenied) ||
        (verified instanceof Errors.CDNNeedsUpgrade)
      ) {
        return verified
      } if (verified instanceof Errors.DomainVerificationFailed) {
        // Verification fails when the domain is external so either its missing the TXT record
        // or it's available to purchase, so we try to purchase it
        const purchased = await purchaseDomainIfAvailable(output, now, alias, contextName)
        if (
          (purchased instanceof Errors.DomainNotFound) ||
          (purchased instanceof Errors.InvalidCoupon) ||
          (purchased instanceof Errors.MissingCreditCard) ||
          (purchased instanceof Errors.PaymentSourceNotFound) ||
          (purchased instanceof Errors.UnsupportedTLD) ||
          (purchased instanceof Errors.UsedCoupon) ||
          (purchased instanceof Errors.UserAborted)
        ) {
          return purchased
        } else if (!purchased) {
          return verified
        }
      } else {
        output.success(`Domain ${domain} added!`)
      }

      const domainInfo = await getDomainInfo(now, domain, contextName)
      return domainInfo === null
        ? new Errors.DomainNotFound(domain)
        : domainInfo

    } else {
      // If we couldn't find nameservers we try to purchase the domain
      const purchased = await purchaseDomainIfAvailable(output, now, alias, contextName)
      if (
        (purchased instanceof Errors.DomainNotFound) ||
        (purchased instanceof Errors.InvalidCoupon) ||
        (purchased instanceof Errors.MissingCreditCard) ||
        (purchased instanceof Errors.PaymentSourceNotFound) ||
        (purchased instanceof Errors.UnsupportedTLD) ||
        (purchased instanceof Errors.UsedCoupon) ||
        (purchased instanceof Errors.UserAborted)
      ) {
        return purchased
      }

      const domainInfo = await getDomainInfo(now, domain, contextName)
      return domainInfo === null
        ? new Errors.DomainNotFound(domain)
        : domainInfo
    }
  } else {
    // If we have records from the domain we have to try to verify in case it is not
    // verified and from this point we can be sure about its verification
    output.debug(`Domain is known for ZEIT World`)
    if (!info.verified) {
      const verified = await verifyDomain(now, domain, contextName, { isExternal: info.isExternal })
      if (
        (verified instanceof Errors.DomainNotVerified) ||
        (verified instanceof Errors.DomainPermissionDenied) ||
        (verified instanceof Errors.DomainVerificationFailed) ||
        (verified instanceof Errors.CDNNeedsUpgrade)
      ) {
        return verified
      }
    }

    return info
  }
}

export default setupDomain

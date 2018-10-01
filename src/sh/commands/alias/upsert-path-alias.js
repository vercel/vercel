// @flow
import wait from '../../../../util/output/wait'
import { Now, Output } from '../../util/types'
import type { AliasRecord, PathRule } from '../../util/types'
import * as Errors from '../../util/errors'
import createCertForAlias from './create-cert-for-alias'
import setupDomain from './setup-domain'

const NOW_SH_REGEX = /\.now\.sh$/

async function upsertPathAlias(output: Output,now: Now, rules: PathRule[], alias: string, contextName: string) {
  let externalDomain = false

  if (!NOW_SH_REGEX.test(alias)) {
    const domainInfo = await setupDomain(output, now, alias, contextName)
    if (
      (domainInfo instanceof Errors.DNSPermissionDenied) ||
      (domainInfo instanceof Errors.DomainNameserversNotFound) ||
      (domainInfo instanceof Errors.DomainNotFound) ||
      (domainInfo instanceof Errors.DomainNotVerified) ||
      (domainInfo instanceof Errors.DomainPermissionDenied) ||
      (domainInfo instanceof Errors.DomainVerificationFailed) ||
      (domainInfo instanceof Errors.InvalidCoupon) ||
      (domainInfo instanceof Errors.MissingCreditCard) ||
      (domainInfo instanceof Errors.CDNNeedsUpgrade) ||
      (domainInfo instanceof Errors.PaymentSourceNotFound) ||
      (domainInfo instanceof Errors.UnsupportedTLD) ||
      (domainInfo instanceof Errors.UsedCoupon) ||
      (domainInfo instanceof Errors.UserAborted)
    ) {
      return domainInfo
    }

    externalDomain = domainInfo.isExternal
  }

  const cancelMessage = wait(`Updating path alias rules for ${alias}`)
  try {
    const record: AliasRecord = await now.fetch(`/now/aliases`, {
      body: { alias, rules },
      method: 'POST',
    })
    cancelMessage()
    return record
  } catch (error) {
    cancelMessage()

    // If the certificate is missing we create it without expecting failures
    // then we call back upsertPathAliasRules
    if (error.code === 'cert_missing' || error.code === 'cert_expired') {
      const cert = await createCertForAlias(output, now, contextName, alias, !externalDomain)
      if (
        (cert instanceof Errors.CantSolveChallenge) ||
        (cert instanceof Errors.DomainConfigurationError) ||
        (cert instanceof Errors.DomainPermissionDenied) ||
        (cert instanceof Errors.DomainsShouldShareRoot) ||
        (cert instanceof Errors.DomainValidationRunning) ||
        (cert instanceof Errors.InvalidWildcardDomain) ||
        (cert instanceof Errors.TooManyCertificates) ||
        (cert instanceof Errors.TooManyRequests)
      ) {
        return cert
      } else {
        return upsertPathAlias(output, now, rules, alias, contextName)
      }
    }

    // The alias already exists so we fail in silence returning the id
    if (error.status === 409) {
      const sameRecord: AliasRecord = { uid: error.uid, alias: error.alias }
      return sameRecord
    }

    // There was a validation error for a rule
    if (error.code === 'rule_validation_failed') {
      return new Errors.RuleValidationFailed(error.serverMessage)
    }

    // We do not support nested subdomains
    if (error.code === 'invalid_alias') {
      return new Errors.InvalidAlias(alias)
    }

    if (error.status === 403) {
      if (error.code === 'alias_in_use') {
        console.log(error)
        return new Errors.AliasInUse(alias)
      }

      if (error.code === 'forbidden') {
        return new Errors.DomainPermissionDenied(alias, contextName)
      }
    }

    throw error
  }
}

export default upsertPathAlias

import psl from 'psl';

import purchaseDomainIfAvailable from './purchase-domain-if-available';
import maybeGetDomainByName from './maybe-get-domain-by-name';
import addDomain from './add-domain';
import verifyDomain from './verify-domain';
import * as Errors from '../errors';

export default async function setupDomain(output, now, alias, contextName) {
  const { domain } = psl.parse(alias);
  output.debug(`Trying to fetch domain ${domain} by name`);
  const info = await maybeGetDomainByName(output, now, contextName, domain);
  if (info instanceof Errors.DomainPermissionDenied) {
    return info;
  }

  if (info) {
    output.debug(`The domain exists but it's not verified`);
    if (!info.verified) {
      const verificationResult = await verifyDomain(now, domain, contextName)
      if (verificationResult instanceof Errors.DomainVerificationFailed) {
        output.debug(`Domain verification failed`);
        return verificationResult;
      }

      output.debug(`Domain successfuly verified`);
      return maybeGetDomainByName(output, now, contextName, domain);
    }

    output.debug(`Domain is already verified`);
    return info;
  }

  output.debug(`The domain doesn't exist, trying to purchase it`);
  const purchased = await purchaseDomainIfAvailable(output, now, alias, contextName);
  if (
    purchased instanceof Errors.DomainNotAvailable ||
    purchased instanceof Errors.DomainNotFound ||
    purchased instanceof Errors.DomainServiceNotAvailable ||
    purchased instanceof Errors.InvalidDomain ||
    purchased instanceof Errors.MissingCreditCard ||
    purchased instanceof Errors.PaymentSourceNotFound ||
    purchased instanceof Errors.UnexpectedDomainPurchaseError ||
    purchased instanceof Errors.UnsupportedTLD ||
    purchased instanceof Errors.UserAborted
  ) {
    output.debug(`The domain wasn't purchased`);
    return purchased;
  }

  if (!purchased) {
    output.debug(`The domain is not available to purcahse. Adding it`);
    const addResult = await addDomain(now, domain, contextName);
    if (addResult instanceof Errors.InvalidDomain) {
      return addResult;
    }

    if (!addResult.verified) {
      const verificationResult = await verifyDomain(now, domain, contextName)
      if (verificationResult instanceof Errors.DomainVerificationFailed) {
        output.debug(`Domain was added but verification failed`);
        return verificationResult;
      }

      output.debug(`Domain successfuly added and verified`);
      return verificationResult;
    }

    output.debug(`Domain successfuly added and verified`)
    return addResult;
  }

  output.debug(`The domain was purchased`);
  const purchasedDomain = await maybeGetDomainByName(output, now, contextName, domain);
  if (!purchasedDomain.verified) {
    const verificationResult = await verifyDomain(now, domain, contextName)
    if (verificationResult instanceof Errors.DomainVerificationFailed) {
      output.debug(`Domain was purchased but it is still pending`);
      return new Errors.DomainVerificationFailed({
        domain: verificationResult.domain,
        nsVerification: verificationResult.nsVerification,
        txtVerification: verificationResult.txtVerification,
        purchased: true
      });
    }

    output.debug(`Domain was purchased and it is verified`);
    return maybeGetDomainByName(output, now, contextName, domain);
  }

  output.debug(`Domain was purchased and it is verified`);
  return maybeGetDomainByName(output, now, contextName, domain);
}

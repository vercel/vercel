import psl from 'psl';
import { NowError } from '../now-error';
import { Domain } from '../../types';
import { Output } from '../output';
import * as ERRORS from '../errors-ts';
import addDomain from './add-domain';
import Client from '../client';
import maybeGetDomainByName from './maybe-get-domain-by-name';
import purchaseDomainIfAvailable from './purchase-domain-if-available';
import verifyDomain from './verify-domain';

export default async function setupDomain(
  output: Output,
  client: Client,
  alias: string,
  contextName: string
) {
  const parsedDomain = psl.parse(alias);
  if (parsedDomain.error) {
    throw new ERRORS.InvalidDomain(alias, parsedDomain.error.message);
  }
  if (!parsedDomain.domain) {
    throw new ERRORS.InvalidDomain(alias);
  }

  const { domain } = parsedDomain;
  output.debug(`Trying to fetch domain ${domain} by name`);
  const info = await maybeGetDomainByName(client, contextName, domain);
  if (info instanceof ERRORS.DomainPermissionDenied) {
    return info;
  }

  if (info) {
    output.debug(`Domain ${domain} found for the given context`);
    if (!info.verified) {
      output.debug(
        `Domain ${domain} is not verified, trying to perform a verification`
      );
      const verificationResult = await verifyDomain(
        client,
        domain,
        contextName
      );
      if (verificationResult instanceof ERRORS.DomainVerificationFailed) {
        output.debug(`Domain ${domain} verification failed`);
        return verificationResult;
      }

      output.debug(`Domain ${domain}  successfuly verified`);
      return maybeGetDomainByName(client, contextName, domain) as Promise<
        Domain
      >;
    }

    output.debug(`Domain ${domain} is already verified`);
    return info;
  }

  output.debug(`The domain ${domain} was not found, trying to purchase it`);
  const purchased = await purchaseDomainIfAvailable(
    output,
    client,
    alias,
    contextName
  );
  if (purchased instanceof NowError) {
    return purchased;
  }

  if (!purchased) {
    output.debug(
      `Domain ${domain} is not available to be purchased. Trying to add it`
    );
    const addResult = await addDomain(client, domain, contextName);
    if (addResult instanceof NowError) {
      return addResult;
    }

    if (!addResult.verified) {
      const verificationResult = await verifyDomain(
        client,
        domain,
        contextName
      );
      if (verificationResult instanceof ERRORS.DomainVerificationFailed) {
        output.debug(`Domain ${domain} was added but it couldn't be verified`);
        return verificationResult;
      }

      output.debug(`Domain ${domain} successfuly added and manually verified`);
      return verificationResult;
    }

    output.debug(
      `Domain ${domain} successfuly added and automatically verified`
    );
    return addResult;
  }

  output.debug(`The domain ${domain} was successfuly purchased`);
  const purchasedDomain = (await maybeGetDomainByName(
    client,
    contextName,
    domain
  )) as Domain;
  if (!purchasedDomain.verified) {
    const verificationResult = await verifyDomain(client, domain, contextName);
    if (verificationResult instanceof ERRORS.DomainVerificationFailed) {
      output.debug(
        `Domain ${domain} was purchased but verification is still pending`
      );
      return new ERRORS.DomainVerificationFailed({
        domain: verificationResult.meta.domain,
        nsVerification: verificationResult.meta.nsVerification,
        txtVerification: verificationResult.meta.txtVerification,
        purchased: true
      });
    }

    output.debug(`Domain ${domain} was purchased and it was manually verified`);
    return maybeGetDomainByName(client, contextName, domain) as Promise<Domain>;
  }

  output.debug(
    `Domain ${domain} was purchased and it is automatically verified`
  );
  return maybeGetDomainByName(client, contextName, domain) as Promise<Domain>;
}

import psl from 'psl';
import { NowError } from '../now-error';
import { Domain } from '../../types';
import { Output } from '../output';
import * as ERRORS from '../errors-ts';
import addDomain from './add-domain';
import Client from '../client';
import maybeGetDomainByName from './maybe-get-domain-by-name';
import purchaseDomainIfAvailable from './purchase-domain-if-available';
import extractDomain from '../alias/extract-domain';

export default async function setupDomain(
  output: Output,
  client: Client,
  alias: string,
  contextName: string
) {
  const aliasDomain = extractDomain(alias);
  output.debug(`Trying to fetch domain ${aliasDomain} by name`);
  const info = await maybeGetDomainByName(client, contextName, aliasDomain);
  if (info instanceof ERRORS.DomainPermissionDenied) {
    return info;
  }

  if (info) {
    const { name: domain } = info;
    output.debug(`Domain ${domain} found for the given context`);
    return info;
  }

  output.debug(
    `The domain ${aliasDomain} was not found, trying to purchase it`
  );
  const purchased = await purchaseDomainIfAvailable(
    output,
    client,
    aliasDomain,
    contextName
  );
  if (purchased instanceof NowError) {
    return purchased;
  }

  if (!purchased) {
    output.debug(
      `Domain ${aliasDomain} is not available to be purchased. Trying to add it`
    );
    const parsedDomain = psl.parse(aliasDomain);
    if (parsedDomain.error) {
      return new ERRORS.InvalidDomain(alias, parsedDomain.error.message);
    }
    if (!parsedDomain.domain) {
      return new ERRORS.InvalidDomain(alias);
    }

    const { domain } = parsedDomain;
    output.debug(`Adding ${domain}`);
    const addResult = await addDomain(client, domain, contextName);
    if (addResult instanceof NowError) {
      return addResult;
    }

    output.debug(
      `Domain ${domain} successfuly added and automatically verified`
    );
    return addResult;
  }

  output.debug(`The domain ${aliasDomain} was successfuly purchased`);
  const purchasedDomain = (await maybeGetDomainByName(
    client,
    contextName,
    aliasDomain
  )) as Domain;
  const { name: domain } = purchasedDomain;

  output.debug(
    `Domain ${domain} was purchased and it is automatically verified`
  );
  return maybeGetDomainByName(client, contextName, domain) as Promise<Domain>;
}

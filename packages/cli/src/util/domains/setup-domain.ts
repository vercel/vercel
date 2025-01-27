import { parse } from 'tldts';
import { NowError } from '../now-error';
import type { Domain } from '@vercel-internals/types';
import * as ERRORS from '../errors-ts';
import addDomain from './add-domain';
import type Client from '../client';
import maybeGetDomainByName from './maybe-get-domain-by-name';
import purchaseDomainIfAvailable from './purchase-domain-if-available';
import extractDomain from '../alias/extract-domain';
import output from '../../output-manager';

export default async function setupDomain(
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
    const parsedDomain = parse(aliasDomain);
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
      `Domain ${domain} successfully added and automatically verified`
    );
    return addResult;
  }

  output.debug(`The domain ${aliasDomain} was successfully purchased`);
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

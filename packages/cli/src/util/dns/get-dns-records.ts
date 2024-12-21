import type { DNSRecord } from '@vercel-internals/types';
import { DomainNotFound } from '../errors-ts';
import type Client from '../client';
import getDomainDNSRecords from './get-domain-dns-records';
import getDomains from '../domains/get-domains';
import chalk from 'chalk';
import output from '../../output-manager';

export type DomainRecordsItem = {
  domainName: string;
  records: DNSRecord[];
};

export default async function getDNSRecords(
  client: Client,
  contextName: string,
  next?: number
) {
  const { domainNames, pagination } = await getDomainNames(
    client,
    contextName,
    next
  );
  const domainsRecords = await Promise.all(
    domainNames.map(createGetDomainRecords(client))
  );
  const onlyRecords = domainsRecords.map(item =>
    item instanceof DomainNotFound ? [] : item
  ) as DNSRecord[][];
  return {
    records: onlyRecords.reduce(getAddDomainName(domainNames), []),
    pagination,
  };
}

function createGetDomainRecords(client: Client) {
  return async (domainName: string) => {
    const data = await getDomainDNSRecords(client, domainName);
    if (data instanceof DomainNotFound) {
      return [];
    }
    return data.records;
  };
}

function getAddDomainName(domainNames: string[]) {
  return (prev: DomainRecordsItem[], item: DNSRecord[], idx: number) => [
    ...prev,
    {
      domainName: domainNames[idx],
      records: item,
    },
  ];
}

async function getDomainNames(
  client: Client,
  contextName: string,
  next?: number
) {
  output.spinner(`Fetching domains under ${chalk.bold(contextName)}`);
  const { domains, pagination } = await getDomains(client, next);
  return { domainNames: domains.map(domain => domain.name), pagination };
}

import chalk from 'chalk';
import { DomainNotFound } from '../errors-ts';
import getDomains from '../domains/get-domains';
import getDomainDNSRecords from './get-domain-dns-records';
import type { DNSRecord } from '../../types';
import type { Output } from '../output';
import type Client from '../client';

export interface DomainRecordsItem {
  domainName: string;
  records: DNSRecord[];
}

export default async function getDNSRecords(
  output: Output,
  client: Client,
  contextName: string,
  next?: number,
) {
  const { domainNames, pagination } = await getDomainNames(
    client,
    contextName,
    next,
  );
  const domainsRecords = await Promise.all(
    domainNames.map(createGetDomainRecords(output, client)),
  );
  const onlyRecords = domainsRecords.map((item) =>
    item instanceof DomainNotFound ? [] : item,
  );
  return {
    records: onlyRecords.reduce(getAddDomainName(domainNames), []),
    pagination,
  };
}

function createGetDomainRecords(output: Output, client: Client) {
  return async (domainName: string) => {
    const data = await getDomainDNSRecords(output, client, domainName);
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
  next?: number,
) {
  client.output.spinner(`Fetching domains under ${chalk.bold(contextName)}`);
  const { domains, pagination } = await getDomains(client, next);
  return { domainNames: domains.map((domain) => domain.name), pagination };
}

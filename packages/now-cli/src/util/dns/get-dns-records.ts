import { DNSRecord } from '../../types';
import { DomainNotFound } from '../errors-ts';
import { Output } from '../output';
import Client from '../client';
import getDomainDNSRecords from './get-domain-dns-records';
import getDomains from '../domains/get-domains';
import wait from '../output/wait';
import chalk from 'chalk';

export type DomainRecordsItem = {
  domainName: string;
  records: DNSRecord[];
};

export default async function getDNSRecords(
  output: Output,
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
    domainNames.map(createGetDomainRecords(output, client))
  );
  const onlyRecords = domainsRecords.map(item =>
    item instanceof DomainNotFound ? [] : item
  ) as DNSRecord[][];
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
  next?: number
) {
  const cancelWait = wait(`Fetching domains under ${chalk.bold(contextName)}`);
  try {
    const { domains, pagination } = await getDomains(client, next);
    return { domainNames: domains.map(domain => domain.name), pagination };
  } finally {
    cancelWait();
  }
}

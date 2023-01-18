import { DNSRecord } from '../../types';
import { DomainNotFound } from '../errors-ts';
import { Output } from '../output';
import Client from '../client';
import getDomainDNSRecords from './get-domain-dns-records';
import getDomains from '../domains/get-domains';
import chalk from 'chalk';

export type DomainRecordsItem = {
  domainName: string;
  records: DNSRecord[];
};

type getDNSRecordsArgs = {
  output: Output;
  client: Client;
  contextName: string;
  next?: number;
  limit?: number;
};

export default async function getDNSRecords(args: getDNSRecordsArgs) {
  const { domainNames, pagination } = await getDomainNames(
    args.client,
    args.contextName,
    args.next,
    args.limit
  );
  const domainsRecords = await Promise.all(
    domainNames.map(
      createGetDomainRecords(args.output, args.client, args.limit)
    )
  );
  const onlyRecords = domainsRecords.map(item =>
    item instanceof DomainNotFound ? [] : item
  ) as DNSRecord[][];
  return {
    records: onlyRecords.reduce(getAddDomainName(domainNames), []),
    pagination,
  };
}

function createGetDomainRecords(output: Output, client: Client, limit: number) {
  return async (domainName: string) => {
    const data = await getDomainDNSRecords({
      output,
      client,
      domain: domainName,
      limit,
    });
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
  limit?: number
) {
  client.output.spinner(`Fetching domains under ${chalk.bold(contextName)}`);
  const { domains, pagination } = await getDomains({ client, next, limit });
  return { domainNames: domains.map(domain => domain.name), pagination };
}

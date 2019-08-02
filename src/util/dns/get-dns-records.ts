import { DNSRecord } from '../../types';
import { DomainNotFound } from '../errors-ts';
import { Output } from '../output';
import Client from '../client';
import getDomainDNSRecords from './get-domain-dns-records';
import getDomains from '../domains/get-domains';

type DomainRecordsItem = {
  domainName: string;
  records: DNSRecord[];
};

export default async function getDNSRecords(
  output: Output,
  client: Client,
  contextName: string
) {
  const domainNames = await getDomainNames(client, contextName);
  const domainsRecords = await Promise.all(
    domainNames.map(createGetDomainRecords(output, client))
  );
  const onlyRecords = domainsRecords.map(
    item => ((item instanceof DomainNotFound) ? [] : item)
  ) as DNSRecord[][];
  return onlyRecords.reduce(getAddDomainName(domainNames), []);
}

function createGetDomainRecords(output: Output, client: Client) {
  return async (domainName: string) => {
    return getDomainDNSRecords(output, client, domainName);
  };
}

function getAddDomainName(domainNames: string[]) {
  return (prev: DomainRecordsItem[], item: DNSRecord[], idx: number) => [
    ...prev,
    {
      domainName: domainNames[idx],
      records: item.sort((a, b) => a.slug.localeCompare(b.slug))
    }
  ];
}

async function getDomainNames(client: Client, contextName: string) {
  const domains = await getDomains(client, contextName);
  return domains
    .map(domain => domain.name)
    .sort((a, b) => a.localeCompare(b));
}

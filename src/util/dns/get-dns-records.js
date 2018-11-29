//      

import getDomainDNSRecords from './get-domain-dns-records';
import isDomainExternal from '../domains/is-domain-external';
import getDomains from '../domains/get-domains';
import { DomainNotFound } from '../errors';
                                       

async function getDNSRecords(output        , now     , contextName        ) {
  const domains           = await getDomains(output, now, contextName);
  const domainNames = domains
    .filter(domain => !isDomainExternal(domain))
    .map(domain => domain.name)
    .sort((a, b) => a.localeCompare(b));
  const domainsDnsRecords = await Promise.all(
    domainNames.map(domainName => getDomainDNSRecords(output, now, domainName))
  );
  return domainsDnsRecords.reduce((result, dnsRecords, idx) => {
    if (!(dnsRecords instanceof DomainNotFound)) {
      return [
        ...result,
        {
          domainName: domainNames[idx],
          records: dnsRecords.sort((a, b) => a.slug.localeCompare(b.slug))
        }
      ];
    }
    return result;
  }, []);
}

export default getDNSRecords;

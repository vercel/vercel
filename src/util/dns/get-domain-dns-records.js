//      

import { DomainNotFound } from "../errors";
                                                  

async function getDomainDNSRecords(output        , now     , domain        ) {
  output.debug(`Fetching for DNS records of domain ${domain}`);
  try {
    const payload = await now.fetch(
      `/v3/domains/${encodeURIComponent(domain)}/records`
    );
    return (payload.records             );
  } catch (error) {
    if (error.code === 'not_found') {
      return new DomainNotFound(domain);
    }
    throw error;
  }
}

export default getDomainDNSRecords;

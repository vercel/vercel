//

import getCerts from './get-certs';

async function getCertsForDomain(output        , now     , domain        ) {
  const certs = await getCerts(output, now);
  return certs.filter(cert => cert.cns[0].endsWith(domain));
}

export default getCertsForDomain;

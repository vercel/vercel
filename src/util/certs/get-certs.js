//      
import { stringify } from 'querystring';

                                            

async function getCerts(output        , now     , domain           ) {
  const query = domain ? stringify({ domain }) : '';
  const payload = await now.fetch(`/v3/now/certs?${query}`);
  const certs                = payload.certs;
  return certs;
}

export default getCerts;

//      
import qs from 'querystring';
import { Now } from '../../util/types';

                     
                    
  

async function getDomainStatus(
  now     ,
  domain        
)                        {
  return await now.fetch(
    `/v3/domains/status?${qs.stringify({ name: domain })}`
  );
}

export default getDomainStatus;

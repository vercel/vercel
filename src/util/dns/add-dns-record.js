//      

import { DomainNotFound, DNSPermissionDenied } from '../errors';

                          
     
                          
                   
                   
                   
     
     
                   
                   
            
                     
                         
                       
                      
       
      

async function addDNSRecord(
  output        ,
  now     ,
  domain        ,
  recordParams              
) {
  try {
    const record   
                  
                     
      = await now.fetch(`/v3/domains/${domain}/records`, {
      body: recordParams,
      method: 'POST'
    });
    return record;
  } catch (error) {
    if (error.status === 403) {
      return new DNSPermissionDenied(domain);
    }

    if (error.status === 404) {
      return new DomainNotFound(domain);
    }

    throw error;
  }
}

export default addDNSRecord;

//      
import wait from '../../util/output/wait';
import { DomainPermissionDenied } from '../../util/errors';
import { Now } from '../../util/types';

                          
              
            
                  
                
                    
    
                  
                    
                    
                      
                      
                    
                    
                 
  

async function getDomainInfo(now     , domain        , context        ) {
  const cancelMessage = wait(`Fetching domain info`);
  try {
    const info             = await now.fetch(`/domains/${domain}`);
    cancelMessage();
    return info;
  } catch (error) {
    cancelMessage();
    if (error.code === 'forbidden') {
      return new DomainPermissionDenied(domain, context);
    } else if (error.status === 404) {
      return null;
    } else {
      throw error;
    }
  }
}

export default getDomainInfo;

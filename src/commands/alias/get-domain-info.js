//      
import wait from '../../util/output/wait';
import { DomainPermissionDenied } from '../../util/errors';


                          
              
            
                  
                
                    
    
                  
                    
                    
                      
                      
                    
                    
                 
  

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
    } if (error.status === 404) {
      return null;
    } 
      throw error;
    
  }
}

export default getDomainInfo;

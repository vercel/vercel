//      

import { DeploymentNotFound, DeploymentPermissionDenied } from '../errors';
                                           
import toHost from '../to-host';

async function getDeploymentByIdOrHost(
  now     ,
  contextName        ,
  idOrHost        
) {
  try {
    const { deployment } =
      idOrHost.indexOf('.') !== -1
        ? await getDeploymentByHost(now, toHost(idOrHost))
        : await getDeploymentById(now, idOrHost);
    return deployment;
  } catch (error) {
    if (error.status === 404) {
      return new DeploymentNotFound(idOrHost, contextName);
    } if (error.status === 403) {
      return new DeploymentPermissionDenied(idOrHost, contextName);
    } 
      throw error;
    
  }
}

async function getDeploymentById(
  now     ,
  id        
)                                      {
  const deployment = await now.fetch(
    `/v5/now/deployments/${encodeURIComponent(id)}`
  );
  return { deployment };
}

                               
               
              
   
  

async function getDeploymentByHost(
  now     ,
  host        
)                                      {
  const response                         = await now.fetch(
    `/v4/now/hosts/${encodeURIComponent(host)}?resolve=1&noState=1`
  );
  return getDeploymentById(now, response.deployment.id);
}

export default getDeploymentByIdOrHost;

//      

                                                          
import fetchDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host';

async function fetchDeploymentFromAlias(
  output        ,
  now     ,
  contextName        ,
  prevAlias              ,
  currentDeployment            
) {
  return prevAlias &&
    prevAlias.deploymentId &&
    prevAlias.deploymentId !== currentDeployment.uid
    ? fetchDeploymentByIdOrHost(now, contextName, prevAlias.deploymentId)
    : null;
}

export default fetchDeploymentFromAlias;

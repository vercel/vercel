//      

                                                                        
import deploymentIsAliased from './deployment-is-aliased';
import getScaleForDC from './get-scale-for-dc';

async function deploymentShouldDownscale(
  output        ,
  now     ,
  deployment                                  
) {
  const isAliased = await deploymentIsAliased(now, deployment);
  output.debug(`Previous deployment is aliased: ${isAliased.toString()}`);

  if ((deployment.type === 'DOCKER' && !!deployment.slot) || deployment.version === 2) {
    // Don't downscale a previous slot or builds deployment
    return false;
  }

  return (
    !isAliased &&
    Object.keys(deployment.scale).reduce((result, dc) => (
        result ||
        getScaleForDC(dc, deployment).min !== 0 ||
        getScaleForDC(dc, deployment).max !== 1
      ), false)
  );
}

export default deploymentShouldDownscale;

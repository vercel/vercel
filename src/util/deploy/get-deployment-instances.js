//      

                                              

async function getDeploymentInstances(
  now     ,
  deploymentId        ,
  requestId        
)                         {
  return now.fetch(
    `/v3/now/deployments/${encodeURIComponent(
      deploymentId
    )}/instances?init=1&requestId=${requestId}`
  );
}

export default getDeploymentInstances;

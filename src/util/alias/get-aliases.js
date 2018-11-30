//      

                                      

async function getAliases(
  now     ,
  deploymentId         
)                        {
  const payload = await now.fetch(
    deploymentId ? `/now/deployments/${deploymentId}/aliases` : '/now/aliases'
  );
  return payload.aliases || [];
}

export default getAliases;

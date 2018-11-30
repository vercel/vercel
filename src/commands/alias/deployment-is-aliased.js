//      

                                                   
import getAliases from '../../util/alias/get-aliases';

async function deploymentIsAliased(now     , deployment            ) {
  const aliases = await getAliases(now);
  return aliases.some(alias => alias.deploymentId === deployment.uid);
}

export default deploymentIsAliased;

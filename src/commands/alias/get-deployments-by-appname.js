//      
import { Now } from '../../util/types';

async function fetchDeploymentsByAppName(now     , appName        ) {
  return now.list(appName, { version: 3 });
}

export default fetchDeploymentsByAppName;

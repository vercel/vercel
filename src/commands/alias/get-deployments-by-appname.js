// @flow
import { Now } from '../../util/types';

async function fetchDeploymentsByAppName(now: Now, appName: string) {
  return now.list(appName, { version: 3 });
}

export default fetchDeploymentsByAppName;

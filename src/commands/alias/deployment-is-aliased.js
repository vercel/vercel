// @flow
import { Now } from '../../util/types';
import type { Deployment } from '../../util/types';
import getAliases from '../../util/alias/get-aliases';

async function deploymentIsAliased(now: Now, deployment: Deployment) {
  const aliases = await getAliases(now);
  return aliases.some(alias => alias.deploymentId === deployment.uid);
}

export default deploymentIsAliased;

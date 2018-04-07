// @flow
import chalk from 'chalk'
import wait from '../../../../util/output/wait'

import { Output, Now } from './types'
import { DeploymentNotFound, DeploymentPermissionDenied } from './errors'

async function fetchDeployment(output: Output, now: Now, contextName: string, id: string) {
  const cancelWait = wait(`Fetching deployment "${id}" in ${chalk.bold(contextName)}`);
  try {
    const deployment = await now.findDeployment(id)
    cancelWait();
    return deployment
  } catch (err) {
    cancelWait();
    if (err.status === 404) {
      return new DeploymentNotFound(id, contextName)
    } else if (err.status === 403) {
      return new DeploymentPermissionDenied(id, contextName)
    } else {
      throw err;
    }
  }
}

export default fetchDeployment

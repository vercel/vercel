// @flow
import chalk from 'chalk'
import { Now, Output } from '../../util/types'
import type { User } from '../../util/types'
import getAppLastDeployment from './get-app-last-deployment'
import getAppName from './get-app-name'
import fetchDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host'
import wait from '../../../../util/output/wait'

async function getDeploymentForAlias(now: Now, output: Output, args: Array<string>, localConfig: string, user: User, contextName: string) {
  const cancelWait = wait(`Fetching deployment to alias in ${chalk.bold(contextName)}`)
  let deployment
  
  // When there are no args at all we try to get the targets from the config
  if (args.length === 2) {
    const [deploymentId] = args
    deployment = await fetchDeploymentByIdOrHost(now, contextName, deploymentId)
  } else {
    const appName = await getAppName(output, localConfig)
    deployment = await getAppLastDeployment(output, now, appName, user, contextName)
  }

  cancelWait()
  return deployment
}

export default getDeploymentForAlias

// @flow
import chalk from 'chalk'
import wait from '../../../../util/output/wait'

import { Output, Now } from './types'
import fetchDeploymentByIdOrHost from './get-deployment-by-id-or-host'
import fetchDeploymentsByAppName from './get-deployments-by-appname'
import type { User } from './types'

async function getAppLastDeployment(output: Output, now: Now, appName: string, user: User, contextName: string) {
  output.debug(`Looking for deployments matching app ${appName}`)
  const cancelWait = wait(`Fetching user deployments in ${chalk.bold(contextName)}`)
  let deployments
  try {
    deployments = await fetchDeploymentsByAppName(now, appName)
    cancelWait()
  } catch (error) {
    cancelWait()
    throw error
  }

  const deploymentItem = deployments
    .sort((a, b) => b.created - a.created)
    .filter(dep => dep.state === 'READY' && dep.creator.uid === user.uid)[0]

  // Try to fetch deployment details
  return deploymentItem
    ? await fetchDeploymentByIdOrHost(output, now, contextName, deploymentItem.uid)
    : null
}

export default getAppLastDeployment

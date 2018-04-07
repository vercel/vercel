// @flow
import { Now, Output } from './types'
import type { User } from './types'
import getAppLastDeployment from './get-app-last-deployment'
import getAppName from './get-app-name'
import fetchDeployment from './get-deployment'

async function getDeploymentForAlias(now: Now, output: Output, args: Array<string>, localConfig: string, user: User, contextName: string) {
  // When there are no args at all we try to get the targets from the config
  if (args.length === 2) {
    const [deploymentId] = args
    return await fetchDeployment(output, now, contextName, deploymentId)
  } else {
    const appName = await getAppName(output, localConfig)
    return await getAppLastDeployment(output, now, appName, user, contextName)
  }
}

export default getDeploymentForAlias

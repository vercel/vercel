// @flow
import chalk from 'chalk'
import wait from '../../../../util/output/wait'
import { Output, Now } from './types'
import type { DeploymentScale } from './types'

async function setScale(output: Output, now: Now, deploymentId: string, scaleArgs: DeploymentScale) {
  const scalesMsg = formatScaleArgs(scaleArgs)
  const cancelWait = wait(`Setting scale rules for regions ${scalesMsg}`)
  try {
    await now.fetch(`/v3/now/deployments/${encodeURIComponent(deploymentId)}/instances`, {
      method: 'PATCH',
      body: scaleArgs
    })
    cancelWait()
  } catch (error) {
    cancelWait()
    throw error
  }
}

function formatScaleArgs(scaleArgs: DeploymentScale) {
  return Object.keys(scaleArgs).map(dc => {
    return `${chalk.bold(dc)}`
  }).join(', ')
}

export default setScale

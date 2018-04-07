// @flow
import chalk from 'chalk'
import elapsed from '../../../../util/output/elapsed'
import wait from '../../../../util/output/wait'
import { Output, Now } from './types'
import type { DeploymentScale } from './types'

async function setScale(output: Output, now: Now, deploymentId: string, scaleArgs: DeploymentScale) {
  const start = Date.now();
  const scalesMsg = formatScaleArgs(scaleArgs)
  const cancelWait = wait(`Setting scale rules for ${scalesMsg}`)

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

  output.success(`Scale rules for ${scalesMsg} saved ${elapsed(Date.now() - start)}`);
}

function formatScaleArgs(scaleArgs: DeploymentScale) {
  return Object.keys(scaleArgs).map(dc => {
    return `${chalk.bold(dc)}`
  }).join(', ')
}

export default setScale

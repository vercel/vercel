// @flow
import chalk from 'chalk'
import wait from '../../../../util/output/wait'
import joinWords from '../../../../util/output/join-words'
import { Output, Now } from '../../util/types'
import type { DeploymentScaleArgs, DeploymentScale } from '../../util/types'
import * as Errors from '../errors';

async function setScale(output: Output, now: Now, deploymentId: string, scaleArgs: DeploymentScaleArgs | DeploymentScale) {
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
    if (error.code === 'forbidden_min_instances') {
      return new Errors.ForbiddenScaleMinInstances(error.max)
    } else if (error.code === 'forbidden_max_instances') {
      return new Errors.ForbiddenScaleMaxInstances(error.max)
    } else if (error.code === 'wrong_min_max_relation') {
      return new Errors.InvalidScaleMinMaxRelation()
    } else if (error.code === 'not_supported_min_scale_slots') {
      return new Errors.NotSupportedMinScaleSlots()
    } else {
      throw error
    }
  }
}

function formatScaleArgs(scaleArgs: DeploymentScaleArgs | DeploymentScale) {
  return joinWords(Object.keys(scaleArgs).map(dc => {
    return `${chalk.bold(dc)}`
  }))
}

export default setScale

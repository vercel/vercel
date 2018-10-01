// @flow
import chalk from 'chalk'
import plural from 'pluralize'
import { Output, Now } from '../../util/types'
import { tick } from '../../../../util/output/chars'
import { VerifyScaleTimeout } from '../../util/errors'
import joinWords from '../../../../util/output/join-words';
import stamp from '../../../../util/output/stamp'
import type { DeploymentScale } from '../../util/types'
import wait from '../../../../util/output/wait'
import verifyDeploymentScale from './verify-deployment-scale'

async function waitForScale(output: Output, now: Now, deploymentId: string, scale: DeploymentScale) {
  const remainingDCs = new Set(Object.keys(scale))
  const scaleStamp = stamp()
  let cancelWait = renderWaitDcs(Array.from(remainingDCs.keys()))

  for await (const dcReady of verifyDeploymentScale(output, now, deploymentId, scale)) {
    cancelWait()
    if (Array.isArray(dcReady)) {
      const [dc, instances] = dcReady
      remainingDCs.delete(dc)
      output.log(`${chalk.cyan(tick)} Scaled ${plural('instance', instances, true)} in ${chalk.bold(dc)} ${scaleStamp()}`)
    } else if (dcReady instanceof VerifyScaleTimeout) {
      return dcReady
    }

    if (remainingDCs.size > 0) {
      cancelWait = renderWaitDcs(Array.from(remainingDCs.keys()))
    }
  }
}

function renderWaitDcs(dcs: string[]) {
  return wait(`Waiting for instances in ${
    joinWords(dcs.map(dc => chalk.bold(dc)))
  } to be ready`)
}

export default waitForScale

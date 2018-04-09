// @flow
import ms from 'ms'
import chalk from 'chalk'
import sleep from 'then-sleep'

import { tick } from '../../../../util/output/chars'
import elapsed from '../../../../util/output/elapsed'
import wait from '../../../../util/output/wait'

import { Output, Now } from '../../util/types'
import type { DeploymentScale } from '../../util/types'
import matchDeploymentScale from './match-deployment-scale'

async function waitForScale(output: Output, now: Now, deploymentId: string, scale: DeploymentScale) {
  const checkInterval = 500
  const timeout = ms('5m')
  const start = Date.now()
  let remainingMatches = new Set(Object.keys(scale))
  let cancelWait = renderRemainingDCsWait(remainingMatches)

  while (true) { // eslint-disable-line
    if (start + timeout <= Date.now()) {
      throw new Error('Timeout while verifying instance count (10m)');
    }

    // Get the matches for deployment scale args
    const matches = await matchDeploymentScale(output, now, deploymentId, scale)
    const newMatches = new Set([...remainingMatches].filter(dc => matches.has(dc)))
    remainingMatches = new Set([...remainingMatches].filter(dc => !matches.has(dc)))

    // When there are new matches we print and check if we are done
    if (newMatches.size !== 0) {
      if (cancelWait) {
        cancelWait()
      }

      // Print the new matches that we got
      for (const dc of newMatches) {
        // $FlowFixMe
        output.log(`${chalk.cyan(tick)} Scaled ${chalk.bold(dc)} (${matches.get(dc)} instance) ${elapsed(Date.now() - start)}`);
      }

      // If we are done return, otherwise put the spinner back
      if (remainingMatches.size === 0) {
        return
      } else {
        cancelWait = renderRemainingDCsWait(remainingMatches)
      }
    }

    // Sleep for the given interval until the next poll
    await sleep(checkInterval);
  }
}

function renderRemainingDCsWait(remainingDcs) {
  return wait(`Waiting for instances in ${
    Array.from(remainingDcs).map(id => chalk.bold(id)).join(', ')
  } to match constraints`)
}

export default waitForScale

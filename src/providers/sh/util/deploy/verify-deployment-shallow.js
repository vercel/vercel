// @flow
import fetch from 'node-fetch'
import { Output, Now } from '../types'
import type { DeploymentScale } from '../types'

// TODO: Refactor the `raceAsyncGenerators` function to also support regular
//       promises without the iterator iterface, then we can remove the async
//       generator since it doesn't yield anything
// eslint-disable-next-line require-yield
async function* verifyDeploymentShallow(
  output: Output,
  now: Now,
  deploymentUrl: string,
  deploymentScale: DeploymentScale
): AsyncGenerator<void, void, void> {
  const dcs = Object.keys(deploymentScale).filter(dc => {
    return deploymentScale[dc].max > 0
  })
  await Promise.all(dcs.map((dc) => verifyDeployment(now, deploymentUrl, dc)))
}

// Throws an error if the deployment failed to boot.
async function verifyDeployment(
  now: Now,
  deploymentUrl: string,
  dc: string
): Promise<void> {
  const res = await now.retry(() => shallowFetch(deploymentUrl, dc), {
    retries: 3
  })

  const shallow = res.headers.get('x-now-shallow')
  if (shallow !== '1') {
    throw new Error(`X-Now-Shallow response header was ${shallow}`)
  }
}

async function shallowFetch(deploymentUrl: string, dc: string) {
  const res = await fetch(`https://alias-${dc}.zeit.co`, {
    headers: {
      Accept: 'application/json',
      Connection: 'close',
      Host: deploymentUrl,
      'X-Now-Shallow': '1'
    }
  })
  if (!res.ok) {
    const error = await res.json()
    throw Object.assign(new Error(error.message), error)
  }
  return res
}

export default verifyDeploymentShallow

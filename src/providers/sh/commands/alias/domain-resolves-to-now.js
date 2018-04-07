// @flow
import fetch from 'node-fetch'
import retry from 'async-retry'
import wait from '../../../../util/output/wait'
import { Output } from './types'

type RetryConfig = {
  retries?: number,
  maxTimeout?: number,
}

async function domainResolvesToNow(output: Output, alias: string, retryConfig?: RetryConfig = {}): Promise<boolean> {
  output.debug(`Checking if ${alias} resolves to now`)
  const cancelMessage = wait(`Checking ${alias} DNS resolution, this may take a while...`)
  let response
  try {
    response = await retry(async () => {
      return fetch(`http://${alias}`, {
        method: 'HEAD',
        redirect: 'manual'
      })
    }, { retries: 2, maxTimeout: 8000, ...retryConfig })
    cancelMessage()
  } catch (error) {
    cancelMessage()
    if (error.code === 'ENOTFOUND') {
      return false
    } else {
      throw error
    }
  }

  return response.headers.get('server') === 'now'
}

export default domainResolvesToNow

// @flow
import chalk from 'chalk'
import plural from 'pluralize'

// External utils
import eraseLines from '../../../../util/output/erase-lines'
import promptBool from '../../../../util/input/prompt-bool'
import stamp from '../../../../util/output/stamp'
import wait from '../../../../util/output/wait'

// Internal utils
import { Now, Output } from '../../util/types'
import { NowError } from '../../util/now-error'
import { DomainNotFound, UserAborted } from '../../util/errors'
import getDomainPrice from './get-domain-price'
import getDomainStatus from './get-domain-status'
import purchaseDomain from './purchase-domain'

// $FlowFixMe
const isTTY = process.stdout.isTTY

async function purchaseDomainIfAvailable(output: Output, now: Now, domain: string, contextName: string) {
  const cancelWait = wait(`Checking status of ${chalk.bold(domain)}`)
  const buyDomainStamp = stamp()
  const { available } = await getDomainStatus(now, domain)

  if (available) {
    // If we can't prompty and the domain is available, we should fail
    if (!isTTY) { return new DomainNotFound(domain) }
    output.debug(`Domain is available to purchase`)
    
    const { period, price } = await getDomainPrice(now, domain)
    cancelWait()
    output.log(
      `Domain not found, but you can buy it under ${
        chalk.bold(contextName)
      }! ${buyDomainStamp()}`
    )

    if (!await promptBool(`Buy ${chalk.underline(domain)} for ${chalk.bold(`$${price}`)} (${plural('yr', period, true)})?`)) {
      output.print(eraseLines(1))
      return new UserAborted()
    }

    output.print(eraseLines(1))
    const result = await purchaseDomain(output, now, domain)
    if (result instanceof NowError) {
      return result
    }

    return true
  } else {
    output.debug(`Domain can't be purchased`)
    cancelWait()
    return false
  }
}

export default purchaseDomainIfAvailable

// @flow
import chalk from 'chalk'
import { Output, Now } from '../types'
import type { Domain } from '../types'
import wait from '../../../../util/output/wait'

async function getDomains(output: Output, now: Now, contextName: string) {
  const cancelWait = wait(`Fetching domains under ${chalk.bold(contextName)}`)
  const payload = await now.fetch('/v3/domains')
  const domains: Domain[] = payload.domains.sort((a, b) => new Date(b.created) - new Date(a.created));
  cancelWait();
  return domains;
}

export default getDomains;

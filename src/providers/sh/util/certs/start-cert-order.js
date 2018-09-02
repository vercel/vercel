// @flow
import chalk from 'chalk'
import { Now } from '../types'
import wait from '../../../../util/output/wait'
import type { CertificateOrder } from '../types'

export default async function startCertOrder(now: Now, cns: string[], contextName: string) {
  const cancelWait = wait(`Creating a certificate order for ${chalk.bold(cns.join(', '))} under ${chalk.bold(contextName)}`);
  try {
    const order: CertificateOrder = await now.fetch('/v3/now/certs', {
      method: 'PATCH',
      body: {
        op: "startOrder",
        domains: cns
      },
    })
    cancelWait()
    return order
  } catch (error) {
    cancelWait()
    throw error
  }
}

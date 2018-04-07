// @flow
import psl from 'psl'
import retry from 'async-retry'
import wait from '../../../../util/output/wait'
import { Now, Output } from './types'

type Certificate = {
  uid: string,
  created: string,
  expiration: string,
  autoRenew: boolean,
  cns: Array<string>
}

// TODO: Enable when we are ready to ship wildcard certificates
const USE_WILDCARD_CERTS = false

async function createCertificateForAlias(output: Output, now: Now, alias: string) {
  const cancelMessage = wait(`Generating a certificate...`)
  const { domain } = psl.parse(alias)
  const cns = USE_WILDCARD_CERTS ? [domain, `*.${domain}`] : [alias]
  const certificate: Certificate = await retry(async (bail) => {
    try {
      await now.fetch('/v3/now/certs', {
        method: 'POST',
        body: { domains: cns },
      })
    } catch (error) {
      if (error.code !== 'configuration_error') {
        bail(error)
      } else {
        throw error
      }
    }
  }, { retries: 3, minTimeout: 30000, maxTimeout: 90000 })
  cancelMessage()
  output.success(`Certificate for ${alias} successfuly created`)
  return certificate
}

export default createCertificateForAlias

// @flow
import { Output, Now } from '../types'
import getCerts from './get-certs'

async function getCertsForDomain(output: Output, now: Now, domain: string) {
  const certs = await getCerts(output, now)
  return certs.filter(cert => cert.cns[0].endsWith(domain))
}

export default getCertsForDomain

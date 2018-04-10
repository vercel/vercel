// @flow
import { readFileSync } from 'fs-extra'
import { resolve } from 'path'
import wait from '../../../../util/output/wait'

import { Now } from '../types'
import { InvalidCert, DomainPermissionDenied } from '../errors'
import type { Certificate } from '../types'

async function createCertFromFile(now: Now, keyPath: string, certPath: string, caPath: string, context: string) {
  const cancelWait = wait('Adding your custom certificate');
  const cert = readFileSync(resolve(certPath), 'utf8')
  const key = readFileSync(resolve(keyPath), 'utf8')
  const ca = readFileSync(resolve(caPath), 'utf8')

  try {
    const certificate: Certificate = await now.fetch('/v3/now/certs', {
      method: 'PUT',
      body: {
        ca, cert, key
      }
    })
    cancelWait()
    return certificate
  } catch(error) {
    cancelWait()
    if (error.code === 'invalid_cert') {
      return new InvalidCert()
    } else if (error.code === 'forbidden') {
      return new DomainPermissionDenied(error.domain, context)
    } else {
      throw error
    }
  }
}

export default createCertFromFile

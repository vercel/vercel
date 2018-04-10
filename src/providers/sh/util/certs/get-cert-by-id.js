// @flow

import getCerts from './get-certs'
import { Output, Now } from '../types'

async function getCertById(output: Output, now: Now, id: string) {
  const certs = await getCerts(output, now)
  return certs.find(c => c.uid === id)
}

export default getCertById

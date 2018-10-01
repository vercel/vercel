// @flow
import type { Now } from '../types'

export default function updateDomain(now: Now, name: string, cdnEnabled: boolean) {
  return now.fetch(`/v3/domains/${name}`, {
    body: { op: 'setCdn', value: cdnEnabled },
    method: 'PATCH',
  })
}

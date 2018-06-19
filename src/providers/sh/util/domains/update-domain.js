// @flow
import type { Now } from '../types'

export default function updateDomain(now: Now, name: string, cdnEnabled: boolean) {
  return now.fetch(`/domains/${name}`, {
    body: { op: 'setCdn', value: cdnEnabled },
    method: 'PATCH',
  })
}

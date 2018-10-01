// @flow
import { InvalidRegionOrDCForScale, InvalidAllForScale } from '../errors'
import regionOrDCToDC from './region-or-dc-to-dc'
import type { DC } from './constants'

export default function normalizeRegionsList(regionsOrDCs: string[]): InvalidRegionOrDCForScale | InvalidAllForScale | Array<$Values<DC>> {
  if (regionsOrDCs.includes('all')) {
    if (regionsOrDCs.length > 1) {
      return new InvalidAllForScale();
    }

    return ['all'];
  }

  const dcs: Set<$Values<DC>> = new Set()
  for (const regionOrDC of regionsOrDCs) {
    const dc = regionOrDCToDC(regionOrDC)
    if (dc === undefined) {
      return new InvalidRegionOrDCForScale(regionOrDC)
    }
    dcs.add(dc)
  }

  return Array.from(dcs)
}

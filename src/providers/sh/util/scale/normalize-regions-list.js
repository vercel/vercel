// @flow
import { REGION_TO_DC } from './constants'
import { InvalidRegionOrDCForScale, InvalidAllForScale } from '../errors'
import regionOrDCToDC from './region-or-dc-to-dc'
import type { RegionToDC } from './constants'

export default function normalizeRegionsList(regionsOrDCs: string[]): InvalidRegionOrDCForScale | InvalidAllForScale | Array<$Values<RegionToDC>> {
  const allDcs = Object.keys(REGION_TO_DC).map(key => REGION_TO_DC[key])
  if (regionsOrDCs.includes('all')) {
    return regionsOrDCs.length > 1
      ? new InvalidAllForScale()
      : allDcs
  }

  const dcs: Set<$Values<RegionToDC>> = new Set()
  for (const regionOrDC of regionsOrDCs) {
    const dc = regionOrDCToDC(regionOrDC)
    if (dc !== undefined) {
      dcs.add(dc)
    } else {
      return new InvalidRegionOrDCForScale(regionOrDC)
    }
  }

  return Array.from(dcs)
}

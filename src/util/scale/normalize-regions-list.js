//
import { InvalidRegionOrDCForScale, InvalidAllForScale } from '../errors';
import regionOrDCToDC from './region-or-dc-to-dc';

export default function normalizeRegionsList(regionsOrDCs) {
  if (regionsOrDCs.includes('all')) {
    if (regionsOrDCs.length > 1) {
      return new InvalidAllForScale();
    }

    return ['all'];
  }

  const dcs = new Set();
  for (const regionOrDC of regionsOrDCs) {
    const dc = regionOrDCToDC(regionOrDC);
    if (dc === undefined) {
      return new InvalidRegionOrDCForScale(regionOrDC);
    }
    dcs.add(dc);
  }

  return Array.from(dcs);
}

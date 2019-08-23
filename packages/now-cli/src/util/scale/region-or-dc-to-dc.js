//
import { REGION_TO_DC } from './constants';

function regionOrDCToDC(regionOrDC) {
  const allDcs = Object.keys(REGION_TO_DC).map(key => REGION_TO_DC[key]);
  if (Object.keys(REGION_TO_DC).includes(regionOrDC)) {
    return REGION_TO_DC[regionOrDC];
  }
  if (allDcs.includes(regionOrDC)) {
    // $FlowFixMe
    return regionOrDC;
  }
}

export default regionOrDCToDC;

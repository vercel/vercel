//@flow

const REGIONS = new Set(["sfo", "bru"]);
const DCS = new Set(["sfo1", "bru1"]);
const ALL = 'all';

// if supplied with a region (eg: `sfo`) it returns
// the default dc for it (`sfo1`)
// if supplied with a dc id, it just returns it
function getDcId(r: string) {
  return /\d$/.test(r) ? r : `${r}1`
}

// determines if the supplied string is a valid
// region name or dc id
function isValidRegionOrDcId(r: string) {
  return REGIONS.has(r) || DCS.has(r);
}

// receives a list of region or ids, and returns it
// normalized as a list of dcs. the list can contain 
// the special string `all`
function normalizeRegionsList(regions: Array<string>) {
  let all = false;
  let asDcs = [];

  for (const r of regions) {
    if (r === ALL) {
      all = true;
    } else {
      if (all) {
        const err = new Error('`all` cannot be used unless it is the only item on the list of regions')
        //$FlowFixMe
        err.code = 'INVALID_ALL'
        throw err;
      } else {
        if (isValidRegionOrDcId(r)) {
          asDcs.push(getDcId(r))
        } else {
          const err = new Error(`The supplied region or dc "${r}" is invalid`)
          //$FlowFixMe
          err.code = 'INVALID_ID'
          //$FlowFixMe
          err.id = r;
          throw err;
        }
      }
    }
  }

  if (all) {
    return Array.from(DCS);
  } else {
    return asDcs;
  }
}

module.exports = {
  getDcId,
  isValidRegionOrDcId,
  normalizeRegionsList
}

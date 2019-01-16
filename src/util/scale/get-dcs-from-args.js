//
import isValidMinMaxValue from './is-valid-min-max-value';
import normalizeRegionsList from './normalize-regions-list';

export default function getDCsFromArgs(args) {
  const dcIds = (isValidMinMaxValue(args[2]) ? 'all' : args[2]).split(',');
  return normalizeRegionsList(dcIds);
}

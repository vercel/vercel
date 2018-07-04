// @flow
import { ConflictingOption } from './errors'

export default function getBooleanOptionValue(opts: {}, name: string) {
  const positiveValue = typeof opts[`--${name}`] !== 'undefined'
  const negativeValue = typeof opts[`--no-${name}`] !== 'undefined'

  if (positiveValue && negativeValue) {
    return new ConflictingOption(name);
  } else if (positiveValue) {
    return true;
  } else if (negativeValue) {
    return false;
  }

  return undefined;
}

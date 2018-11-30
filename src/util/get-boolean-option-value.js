//      
import { ConflictingOption } from './errors';

export default function getBooleanOptionValue(opts    , name        ) {
  const positiveValue = typeof opts[`--${name}`] !== 'undefined';
  const negativeValue = typeof opts[`--no-${name}`] !== 'undefined';

  if (positiveValue && negativeValue) {
    return new ConflictingOption(name);
  } if (positiveValue) {
    return true;
  } if (negativeValue) {
    return false;
  }

  return undefined;
}

// @flow
import { InvalidMinForScale } from '../errors';
import toNumberOrAuto from './to-number-or-auto';
import isValidMinMaxValue from './is-valid-min-max-value';

export default function getRawMinFromArgs(args: string[]) {
  if (isValidMinMaxValue(args[2])) {
    return toNumberOrAuto(args[2]);
  } else if (isValidMinMaxValue(args[3])) {
    return toNumberOrAuto(args[3]);
  } else if (args[3]) {
    return new InvalidMinForScale(args[3]);
  } else {
    return 0;
  }
}

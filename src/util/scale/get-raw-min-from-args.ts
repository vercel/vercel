import { InvalidMinForScale } from '../errors-ts';
import toNumberOrAuto from './to-number-or-auto';
import isValidMinMaxValue from './is-valid-min-max-value';

export default function getRawMinFromArgs(args: string[]) {
  if (isValidMinMaxValue(args[2])) {
    return toNumberOrAuto(args[2]);
  } if (isValidMinMaxValue(args[3])) {
    return toNumberOrAuto(args[3]);
  } if (args[3]) {
    return new InvalidMinForScale(args[3]);
  } 
    return 0;
  
}

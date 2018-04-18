// @flow
import { InvalidMinForScale } from '../errors'
import toNumberOrAuto from './to-number-or-auto'
import isValidMinMaxValue from './is-valid-min-max-value'

export default function getMinFromArgs(args: string[]) {
  if (isValidMinMaxValue(args[2])) {
    return toMinValue(toNumberOrAuto(args[2]))
  } else if (isValidMinMaxValue(args[3])) {
    return toMinValue(toNumberOrAuto(args[3]))
  } else if (args[3]) {
    return new InvalidMinForScale(args[3])
  } else {
    return 0
  }
}

function toMinValue(value: 'auto' | number) {
  return value === 'auto' ? 0 : value
}

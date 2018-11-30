//      
import getRawMinFromArgs from './get-raw-min-from-args';

export default function getMinFromArgs(args          ) {
  const result = getRawMinFromArgs(args);
  return typeof result === 'string' ? toMinValue(result) : result;
}

function toMinValue(value                 ) {
  return value === 'auto' ? 0 : value;
}

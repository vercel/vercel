//      
export default function isValidValueForMinOrMax(value        ) {
  return value === 'auto' || /^\d+$/.test(value);
}

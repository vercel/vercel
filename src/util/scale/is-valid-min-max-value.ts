export default function isValidValueForMinOrMax(value: string) {
  return value === 'auto' || /^\d+$/.test(value);
}

export function isCanary() {
  return process.env.__NOW_CANARY === '1';
}

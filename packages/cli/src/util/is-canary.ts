import pkg from './pkg.js';

export function isCanary() {
  return pkg.version.includes('canary');
}

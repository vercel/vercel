import pkg from '../../package.json';

export function isCanary() {
  return pkg.version.includes('canary');
}

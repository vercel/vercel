import pkg from '../../../packages/cli/package.json';

export function isCanary() {
  return pkg.version.includes('canary');
}

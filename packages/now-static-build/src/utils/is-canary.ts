import { version } from '../../package.json';

export function isCanary() {
  return version && version.includes('canary');
}

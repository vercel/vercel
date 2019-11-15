//eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

export function isCanary() {
  return pkg.version && pkg.version.includes('canary');
}

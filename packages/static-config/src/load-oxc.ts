import { createRequire } from 'node:module';

const requireOxc = createRequire(__filename);

export function loadOxcParser(): typeof import('oxc-parser') {
  return requireOxc('oxc-parser') as typeof import('oxc-parser');
}

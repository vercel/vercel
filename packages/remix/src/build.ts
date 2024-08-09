import { build as buildVite } from './build-vite';
import { build as buildLegacy } from './build-legacy';
import { isVite } from './utils';
import type { BuildV2 } from '@vercel/build-utils';

export const build: BuildV2 = opts => {
  return isVite(opts.workPath) ? buildVite(opts) : buildLegacy(opts);
};

import type { BuildV2 } from '@vercel/build-utils';
import { build as buildLegacy } from './build-legacy';
import { build as buildVite } from './build-vite';
import { isVite } from './utils';

export const build: BuildV2 = opts => {
  return isVite(opts.workPath) ? buildVite(opts) : buildLegacy(opts);
};

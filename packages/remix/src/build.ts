import { build as buildVite } from './build-vite';
import { build as buildLegacy } from './build-legacy';
import { findConfig } from './utils';
import type { BuildV2 } from '@vercel/build-utils';

export const build: BuildV2 = opts => {
  const isLegacy = findConfig(opts.workPath, 'remix.config');
  return isLegacy ? buildLegacy(opts) : buildVite(opts);
};

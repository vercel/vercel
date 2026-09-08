import { createStaticBuilder } from '@vercel-internals/builder-orchestration/static-builder';
import { VERCEL_CONFIG_EXTENSIONS } from '../util/compile-vercel-config';

export const { version, build, shouldServe } = createStaticBuilder(
  VERCEL_CONFIG_EXTENSIONS
);

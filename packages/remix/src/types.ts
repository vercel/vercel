import type { Images } from '@vercel/build-utils';

// Stripped down version of `@remix-run/dev` AppConfig with the addition of an optional images object that's specific to vercel
export interface AppConfig {
  cacheDirectory?: string;
  serverBuildDirectory?: string;
  serverBuildPath?: string;
  serverBuildTarget?: string;
  images?: Images;
}

import {
  defaultCachePathGlob,
  glob,
  type PrepareCache,
} from '@vercel/build-utils';

/**
 * IMPORTANT: This function intentionally does not use the `entrypoint` or
 * `config` parameters. Its output depends only on `repoRootPath`/`workPath`,
 * which are the same for every build entry in a deployment. This property is
 * relied upon by the build infrastructure to avoid redundant invocations when
 * a project has multiple entrypoints using this builder. Do not introduce
 * `entrypoint` or `config` dependencies without coordinating with the build
 * infrastructure team.
 */
export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};

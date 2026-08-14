import Ajv from 'ajv';
import { getMaxDurationLimit } from '@vercel/build-utils';

type BuildSchema = () => object;

const ajv = new Ajv();
const validatorCacheByLimit = new Map<
  number | 'skipped',
  ReturnType<typeof ajv.compile>
>();

/**
 * This lazy compiler supports direct source execution. The production build
 * and Vitest replace it with a validator compiled during `scripts/build.mjs`.
 *
 * Keep selecting by the current limit at validation time: the environment
 * variable may be set after this module is imported.
 */
export function getConfigValidator(buildSchema: BuildSchema) {
  if (process.env.VITEST) {
    throw new Error('Vitest must use the precompiled config validator');
  }

  const cacheKey = getMaxDurationLimit() ?? 'skipped';
  let validate = validatorCacheByLimit.get(cacheKey);
  if (!validate) {
    validate = ajv.compile(buildSchema());
    validatorCacheByLimit.set(cacheKey, validate);
  }
  return validate;
}

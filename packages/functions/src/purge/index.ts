import { getContext } from '../get-context';
import { DangerouslyDeleteOptions } from './types';

export const invalidateByTag = (tag: string | string[]) => {
  const api = getContext().purge;
  if (api) {
    return api.invalidateByTag(tag);
  }
  return Promise.resolve();
};

export const dangerouslyDeleteByTag = (
  tag: string | string[],
  options?: DangerouslyDeleteOptions
) => {
  const api = getContext().purge;
  if (api) {
    return api.dangerouslyDeleteByTag(tag, options);
  }
  return Promise.resolve();
};

export const invalidateBySrcImage = (src: string | string[]): Promise<void> => {
  const api = getContext().purge;
  return api ? api.invalidateBySrcImage(src) : Promise.resolve();
};

export const dangerouslyDeleteBySrcImage = (
  src: string | string[],
  options?: DangerouslyDeleteOptions
): Promise<void> => {
  const api = getContext().purge;
  return api
    ? api.dangerouslyDeleteBySrcImage(src, options)
    : Promise.resolve();
};

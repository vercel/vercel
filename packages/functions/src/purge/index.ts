import { getContext } from '../get-context';
import { DangerouslyDeleteOptions } from './types';
export * from './types';

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

import { getContext } from '../get-context';
export * from './types';

export const addCacheTag = (tag: string | string[]) => {
  const api = getContext().purge;
  if (api) {
    return api.addCacheTag(tag);
  }
  return Promise.resolve();
};
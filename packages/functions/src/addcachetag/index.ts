import { getContext } from '../get-context';

export const addCacheTag = (tag: string | string[]) => {
  const api = getContext().addCacheTag;
  if (api) {
    return api.addCacheTag(tag);
  }
  return Promise.resolve();
};

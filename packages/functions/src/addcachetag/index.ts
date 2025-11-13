import { getContext } from '../get-context';

export const addCacheTag = (tag: string | string[]) => {
  const addCacheTag = getContext().addCacheTag;
  if (addCacheTag) {
    return addCacheTag(tag);
  }
  return Promise.resolve();
};

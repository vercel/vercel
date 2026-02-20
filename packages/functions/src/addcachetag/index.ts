import { getContext } from '../get-context';
import { encodeTag } from '../encode-tag';

export const addCacheTag = (tag: string | string[]) => {
  const addCacheTag = getContext().addCacheTag;
  if (addCacheTag) {
    return addCacheTag(encodeTag(tag));
  }
  return Promise.resolve();
};

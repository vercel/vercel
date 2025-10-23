/**
 * Add cache tag API.
 */
export interface AddCacheTagApi {
  /**
   * Add one or more tags to the cache content
   *
   * @param tag One or more tags to add to the cache content.
   * @returns A promise that resolves when the tag is added.
   */
  addCacheTag: (tag: string | string[]) => Promise<void>;
}

/**
   * Vercel Cache Add Cache Tag APIs.
*/
export interface AddCacheTagApi {
/**
 * Add tags to the cache.
 *
 * @param tags The tags to add.
 * @returns A promise that resolves when the tags are added.
 */
addCacheTag: (tags: string | string[]) => Promise<void>;
}
  
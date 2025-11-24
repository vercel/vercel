/**
 * Vercel AddCacheTag API.
 * A function that adds one or more tags to the cache content.
 *
 * @param tag One or more tags to add to the cache content.
 * @returns A promise that resolves when the tag is added.
 */
export type AddCacheTagApi = (tag: string | string[]) => Promise<void>;

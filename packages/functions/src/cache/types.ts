/**
 * Interface representing the runtime cache.
 */
export interface RuntimeCache {
  /**
   * Deletes a value from the cache.
   *
   * @param {string} key - The key of the value to delete.
   * @returns {Promise<void>} A promise that resolves when the value is deleted.
   */
  delete: (key: string) => Promise<void>;

  /**
   * Wraps a function call with caching.
   *
   * @param {string} key - The key to use for the cache entry.
   * @param {Function} fn - The function to wrap with caching.
   * @param {Object} [options] - Optional settings for the cache entry.
   * @param {string[]} [options.tags] - Optional tags to associate with the cache entry.
   * @param {number} [options.ttl] - Optional time-to-live for the cache entry, in seconds. Default is 1 year.
   * @returns {Promise<unknown | null>} A promise that resolves to the value.
   */
  cache: (
    key: string,
    fn: (...args: any[]) => Promise<unknown>,
    options?: { tags?: string[]; ttl?: number }
  ) => Promise<unknown | null>;

  /**
   * Retrieves a value from the cache.
   *
   * @param {string} key - The key of the value to retrieve.
   * @param {Object} [options] - Optional settings for the cache entry.
   * @param {string[]} [options.tags] - Optional tags to associate with the cache entry. If provided on set, this must also be provided to ensure cross-deployment cache consistency.
   * @param {number} [options.ttl] - Optional time-to-live for the cache entry, in seconds. If provided on set, this must also be provided to ensure cross-deployment cache consistency.
   * @returns {Promise<unknown | null>} A promise that resolves to the value, or null if not found.
   */
  get: (
    key: string,
    options?: { tags?: string[]; ttl?: number }
  ) => Promise<unknown | null>;

  /**
   * Sets a value in the cache.
   *
   * @param {string} key - The key of the value to set.
   * @param {unknown} value - The value to set.
   * @param {Object} [options] - Optional settings for the cache entry.
   * @param {string} [options.name] - Optional user-friendly name for the cache entry used for o11y.
   * @param {string[]} [options.tags] - Optional tags to associate with the cache entry. This must also be provided on get to ensure cross-deployment cache consistency.
   * @param {number} [options.ttl] - Optional time-to-live for the cache entry, in seconds. Default is 1 year. This must also be provided on get to ensure cross-deployment cache consistency.
   * @returns {Promise<void>} A promise that resolves when the value is set.
   */
  set: (
    key: string,
    value: unknown,
    options?: { name?: string; tags?: string[]; ttl?: number }
  ) => Promise<void>;

  /**
   * Expires cache entries by tag.
   *
   * @param {string | string[]} tag - The tag or tags of the cache entries to expire.
   * @returns {Promise<void>} A promise that resolves when the cache entries expiration request is received.
   */
  expireTag: (tag: string | string[]) => Promise<void>;
}

/**
 * Interface representing options for configuring the cache.
 */
export interface CacheOptions {
  /**
   * Optional custom hash function for generating keys.
   *
   * @param {string} key - The key to hash.
   * @returns {string} The hashed key.
   */
  keyHashFunction?: (key: string) => string;

  /**
   * Optional namespace to prefix cache keys.
   */
  namespace?: string;

  /**
   * Optional separator string for the namespace.
   */
  namespaceSeparator?: string;
}

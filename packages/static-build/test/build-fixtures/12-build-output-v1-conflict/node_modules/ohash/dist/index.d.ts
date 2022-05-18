/**
 * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
 *
 * @param {Uint8Array | string} key ASCII only
 * @param {number} seed Positive integer only
 * @return {number} 32-bit positive integer hash
 */
declare function murmurHash(key: Uint8Array | string, seed?: number): number;

interface HashOptions {
    /**
     *
     */
    excludeKeys?: ((key: string) => boolean) | undefined;
    /**
    * hash object keys, values ignored
    */
    excludeValues?: boolean | undefined;
    /**
     * ignore unknown object types
    */
    ignoreUnknown?: boolean | undefined;
    /**
     * optional function that replaces values before hashing
     */
    replacer?: ((value: any) => any) | undefined;
    /**
     * consider 'name' property of functions for hashing
    */
    respectFunctionNames?: boolean | undefined;
    /**
     * consider function properties when hashing
    */
    respectFunctionProperties?: boolean | undefined;
    /**
     * Respect special properties (prototype, letructor) when hashing to distinguish between types
    */
    respectType?: boolean | undefined;
    /**
     * Sort all arrays before hashing
    */
    unorderedArrays?: boolean | undefined;
    /**
     * Sort `Set` and `Map` instances before hashing
    */
    unorderedObjects?: boolean | undefined;
    /**
     * Sort `Set` and `Map` instances before hashing
    */
    unorderedSets?: boolean | undefined;
}
/**
 * Hash any JS value into a string with murmur v3 hash
 * @param {object} object value to hash
 * @param {HashOptions} options hashing options
 * @return {string} hash value
 * @api public
 */
declare function objectHash(object: any, options?: HashOptions): string;

/**
 * Hash any JS value into a string
 * @param {object} object value to hash
 * @param {HashOptions} options hashing options
 * @return {string} hash value
 * @api public
 */
declare function hash(object: any, options?: HashOptions): string;

export { HashOptions, hash, murmurHash, objectHash };

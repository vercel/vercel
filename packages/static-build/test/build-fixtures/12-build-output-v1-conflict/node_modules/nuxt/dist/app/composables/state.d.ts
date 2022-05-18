import type { Ref } from 'vue';
/**
 * Create a global reactive ref that will be hydrated but not shared across ssr requests
 *
 * @param key a unique key ensuring that data fetching can be properly de-duplicated across requests
 * @param init a function that provides initial value for the state when it's not initiated
 */
export declare const useState: <T>(key: string, init?: () => T | Ref<T>) => Ref<T>;

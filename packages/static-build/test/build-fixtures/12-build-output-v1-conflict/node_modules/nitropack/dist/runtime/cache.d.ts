import { EventHandler } from 'h3';
export interface CacheEntry<T = any> {
    value?: T;
    expires?: number;
    mtime?: number;
    integrity?: string;
}
export interface CachifyOptions<T = any> {
    name?: string;
    getKey?: (...args: any[]) => string;
    transform?: (entry: CacheEntry<T>, ...args: any[]) => any;
    group?: string;
    integrity?: any;
    maxAge?: number;
    swr?: boolean;
    staleMaxAge?: number;
    base?: string;
}
export declare function defineCachedFunction<T = any>(fn: ((...args: any[]) => T | Promise<T>), opts: CachifyOptions<T>): (...args: any[]) => Promise<T>;
export declare const cachedFunction: typeof defineCachedFunction;
export interface ResponseCacheEntry<T = any> {
    body: T;
    code: number;
    headers: Record<string, string | number | string[]>;
}
export declare function defineCachedEventHandler<T = any>(handler: EventHandler<T>, opts?: Omit<CachifyOptions<ResponseCacheEntry<T>>, 'getKey'>): EventHandler<T>;
export declare const cachedEventHandler: typeof defineCachedEventHandler;

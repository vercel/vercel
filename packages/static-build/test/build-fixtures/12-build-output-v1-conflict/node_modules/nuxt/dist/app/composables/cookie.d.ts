import { Ref } from 'vue';
import { CookieParseOptions, CookieSerializeOptions } from 'cookie-es';
declare type _CookieOptions = Omit<CookieSerializeOptions & CookieParseOptions, 'decode' | 'encode'>;
export interface CookieOptions<T = any> extends _CookieOptions {
    decode?(value: string): T;
    encode?(value: T): string;
    default?: () => T | Ref<T>;
}
export interface CookieRef<T> extends Ref<T> {
}
export declare function useCookie<T = string>(name: string, _opts?: CookieOptions<T>): CookieRef<T>;
export {};

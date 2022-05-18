import type { Driver } from '../../types';
declare type DriverFactory<T> = (opts?: T) => Driver;
export declare function defineDriver<T = any>(factory: DriverFactory<T>): DriverFactory<T>;
export declare function isPrimitive(arg: any): boolean;
export declare function stringify(arg: any): string;
export declare function normalizeKey(key: string | undefined): string;
export {};

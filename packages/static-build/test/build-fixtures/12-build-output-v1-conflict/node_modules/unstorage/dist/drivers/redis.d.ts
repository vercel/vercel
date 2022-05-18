import { RedisOptions as _RedisOptions } from 'ioredis';
export interface RedisOptions extends _RedisOptions {
    base: string;
    url: string;
}
declare const _default: (opts?: RedisOptions) => import("../types").Driver;
export default _default;

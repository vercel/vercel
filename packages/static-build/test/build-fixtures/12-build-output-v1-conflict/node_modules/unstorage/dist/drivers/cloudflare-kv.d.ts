import type { CloudflareWorkerKV } from 'types-cloudflare-worker';
export interface KVOptions {
    binding?: string | CloudflareWorkerKV;
}
declare const _default: (opts?: KVOptions) => import("../types").Driver;
export default _default;

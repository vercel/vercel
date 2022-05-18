import { WatchOptions } from 'chokidar';
export interface FSStorageOptions {
    base?: string;
    ignore?: string[];
    watchOptions?: WatchOptions;
}
declare const _default: (opts?: FSStorageOptions) => import("../types").Driver;
export default _default;

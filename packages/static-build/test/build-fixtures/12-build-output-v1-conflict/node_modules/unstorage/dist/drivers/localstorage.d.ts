export interface LocalStorageOptions {
    base?: string;
    window?: typeof window;
    localStorage?: typeof window.localStorage;
}
declare const _default: (opts?: LocalStorageOptions) => import("../types").Driver;
export default _default;

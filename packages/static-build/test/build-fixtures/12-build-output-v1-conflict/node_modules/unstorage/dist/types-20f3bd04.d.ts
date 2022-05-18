declare type StorageValue = null | string | String | number | Number | boolean | Boolean | object;
declare type WatchEvent = 'update' | 'remove';
declare type WatchCallback = (event: WatchEvent, key: string) => any;
interface StorageMeta {
    atime?: Date;
    mtime?: Date;
    [key: string]: StorageValue | Date | undefined;
}
interface Driver {
    hasItem: (key: string) => boolean | Promise<boolean>;
    getItem: (key: string) => StorageValue;
    setItem?: (key: string, value: string) => void | Promise<void>;
    removeItem?: (key: string) => void | Promise<void>;
    getMeta?: (key: string) => StorageMeta | Promise<StorageMeta>;
    getKeys: (base?: string) => string[] | Promise<string[]>;
    clear?: () => void | Promise<void>;
    dispose?: () => void | Promise<void>;
    watch?: (callback: WatchCallback) => void | Promise<void>;
}
interface Storage {
    hasItem: (key: string) => Promise<boolean>;
    getItem: (key: string) => Promise<StorageValue>;
    setItem: (key: string, value: StorageValue) => Promise<void>;
    removeItem: (key: string, removeMeta?: boolean) => Promise<void>;
    getMeta: (key: string, nativeMetaOnly?: true) => StorageMeta | Promise<StorageMeta>;
    setMeta: (key: string, value: StorageMeta) => Promise<void>;
    removeMeta: (key: string) => Promise<void>;
    getKeys: (base?: string) => Promise<string[]>;
    clear: (base?: string) => Promise<void>;
    dispose: () => Promise<void>;
    watch: (callback: WatchCallback) => Promise<void>;
    mount: (base: string, driver: Driver) => Storage;
    unmount: (base: string, dispose?: boolean) => Promise<void>;
}

export { Driver as D, Storage as S, WatchEvent as W, StorageValue as a, WatchCallback as b, StorageMeta as c };

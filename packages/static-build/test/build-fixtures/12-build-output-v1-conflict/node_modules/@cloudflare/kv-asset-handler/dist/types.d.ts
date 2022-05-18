export declare type CacheControl = {
    browserTTL: number;
    edgeTTL: number;
    bypassCache: boolean;
};
export declare type AssetManifestType = Record<string, string>;
export declare type Options = {
    cacheControl: ((req: Request) => Partial<CacheControl>) | Partial<CacheControl>;
    ASSET_NAMESPACE: any;
    ASSET_MANIFEST: AssetManifestType | string;
    mapRequestToAsset?: (req: Request, options?: Partial<Options>) => Request;
    defaultMimeType: string;
    defaultDocument: string;
    pathIsEncoded: boolean;
};
export declare class KVError extends Error {
    constructor(message?: string, status?: number);
    status: number;
}
export declare class MethodNotAllowedError extends KVError {
    constructor(message?: string, status?: number);
}
export declare class NotFoundError extends KVError {
    constructor(message?: string, status?: number);
}
export declare class InternalError extends KVError {
    constructor(message?: string, status?: number);
}

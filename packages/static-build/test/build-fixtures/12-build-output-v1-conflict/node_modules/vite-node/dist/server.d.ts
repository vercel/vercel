import { ViteDevServer, TransformResult } from 'vite';
import { D as DepsHandlingOptions, e as ViteNodeServerOptions, F as FetchResult, d as ViteNodeResolveId } from './types-4b326db0.js';

declare function guessCJSversion(id: string): string | undefined;
declare function shouldExternalize(id: string, options?: DepsHandlingOptions, cache?: Map<string, Promise<string | false>>): Promise<string | false>;

declare class ViteNodeServer {
    server: ViteDevServer;
    options: ViteNodeServerOptions;
    private fetchPromiseMap;
    private transformPromiseMap;
    fetchCache: Map<string, {
        timestamp: number;
        result: FetchResult;
    }>;
    constructor(server: ViteDevServer, options?: ViteNodeServerOptions);
    shouldExternalize(id: string): Promise<string | false>;
    resolveId(id: string, importer?: string): Promise<ViteNodeResolveId | null>;
    fetchModule(id: string): Promise<FetchResult>;
    transformRequest(id: string): Promise<TransformResult | null | undefined>;
    getTransformMode(id: string): "web" | "ssr";
    private _fetchModule;
    private _transformRequest;
}

export { ViteNodeServer, guessCJSversion, shouldExternalize };

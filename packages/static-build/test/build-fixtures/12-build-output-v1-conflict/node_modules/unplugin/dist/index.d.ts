import { SourceMap, EmittedAsset, Plugin, PluginContextMeta } from 'rollup';
export { Plugin as RollupPlugin } from 'rollup';
import { Compiler, WebpackPluginInstance } from 'webpack';
export { Compiler as WebpackCompiler } from 'webpack';
import { Plugin as Plugin$1 } from 'vite';
export { Plugin as VitePlugin } from 'vite';
import { Plugin as Plugin$2 } from 'esbuild';
export { Plugin as EsbuildPlugin } from 'esbuild';
import VirtualModulesPlugin from 'webpack-virtual-modules';

declare type Thenable<T> = T | Promise<T>;
declare type TransformResult = string | {
    code: string;
    map?: SourceMap | null;
} | null | undefined;
declare type ExternalIdResult = {
    id: string;
    external?: boolean;
};
interface UnpluginBuildContext {
    addWatchFile: (id: string) => void;
    emitFile: (emittedFile: EmittedAsset) => void;
    getWatchFiles: () => string[];
}
interface UnpluginOptions {
    name: string;
    enforce?: 'post' | 'pre' | undefined;
    buildStart?: (this: UnpluginBuildContext) => Promise<void> | void;
    buildEnd?: (this: UnpluginBuildContext) => Promise<void> | void;
    transformInclude?: (id: string) => boolean;
    transform?: (this: UnpluginBuildContext & UnpluginContext, code: string, id: string) => Thenable<TransformResult>;
    load?: (this: UnpluginBuildContext & UnpluginContext, id: string) => Thenable<TransformResult>;
    resolveId?: (id: string, importer?: string) => Thenable<string | ExternalIdResult | null | undefined>;
    watchChange?: (this: UnpluginBuildContext, id: string, change: {
        event: 'create' | 'update' | 'delete';
    }) => void;
    rollup?: Partial<Plugin>;
    webpack?: (compiler: Compiler) => void;
    vite?: Partial<Plugin$1>;
    esbuild?: {
        onResolveFilter?: RegExp;
        onLoadFilter?: RegExp;
        setup?: Plugin$2['setup'];
    };
}
interface ResolvedUnpluginOptions extends UnpluginOptions {
    __vfs?: VirtualModulesPlugin;
    __vfsModules?: Set<string>;
    __virtualModulePrefix: string;
}
declare type UnpluginFactory<UserOptions> = (options: UserOptions | undefined, meta: UnpluginContextMeta) => UnpluginOptions;
interface UnpluginInstance<UserOptions> {
    rollup: (options?: UserOptions) => Plugin;
    webpack: (options?: UserOptions) => WebpackPluginInstance;
    vite: (options?: UserOptions) => Plugin$1;
    esbuild: (options?: UserOptions) => Plugin$2;
    raw: UnpluginFactory<UserOptions>;
}
interface UnpluginContextMeta extends Partial<PluginContextMeta> {
    framework: 'rollup' | 'vite' | 'webpack' | 'esbuild';
    webpack?: {
        compiler: Compiler;
    };
}
interface UnpluginContext {
    error(message: any): void;
    warn(message: any): void;
}
declare module 'webpack' {
    interface Compiler {
        $unpluginContext: Record<string, ResolvedUnpluginOptions>;
    }
}

declare function createUnplugin<UserOptions = {}>(factory: UnpluginFactory<UserOptions>): UnpluginInstance<UserOptions>;

export { ExternalIdResult, ResolvedUnpluginOptions, Thenable, TransformResult, UnpluginBuildContext, UnpluginContext, UnpluginContextMeta, UnpluginFactory, UnpluginInstance, UnpluginOptions, createUnplugin };

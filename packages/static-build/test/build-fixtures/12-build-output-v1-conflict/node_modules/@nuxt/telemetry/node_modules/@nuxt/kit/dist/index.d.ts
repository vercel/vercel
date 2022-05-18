import { Nuxt, ModuleContainer, ModuleOptions, ModuleDefinition, NuxtModule, NuxtConfig, NuxtOptions, NuxtCompatibility, NuxtCompatibilityIssues, ComponentsDir, Component, NuxtHooks, NuxtPlugin, NuxtPluginTemplate, NuxtTemplate } from '@nuxt/schema';
import { LoadConfigOptions } from 'c12';
import { Import } from 'unimport';
import { Configuration, WebpackPluginInstance } from 'webpack';
import { UserConfig, Plugin } from 'vite';
import * as unctx from 'unctx';
import { Middleware } from 'h3';
import * as consola from 'consola';

declare function useModuleContainer(nuxt?: Nuxt): ModuleContainer;

/**
 * Define a Nuxt module, automatically merging defaults with user provided options, installing
 * any hooks that are provided, and calling an optional setup function for full control.
 */
declare function defineNuxtModule<OptionsT extends ModuleOptions>(definition: ModuleDefinition<OptionsT>): NuxtModule<OptionsT>;

/** Installs a module on a Nuxt instance. */
declare function installModule(moduleToInstall: string | NuxtModule, _inlineOptions?: any, _nuxt?: Nuxt): Promise<void>;

interface LoadNuxtConfigOptions extends LoadConfigOptions<NuxtConfig> {
}
declare function loadNuxtConfig(opts: LoadNuxtConfigOptions): Promise<NuxtOptions>;

interface LoadNuxtOptions extends LoadNuxtConfigOptions {
    /** Load nuxt with development mode */
    dev?: boolean;
    /** Use lazy initialization of nuxt if set to false */
    ready?: boolean;
    /** @deprecated Use cwd option */
    rootDir?: LoadNuxtConfigOptions['cwd'];
    /** @deprecated use overrides option */
    config?: LoadNuxtConfigOptions['overrides'];
}
declare function loadNuxt(opts: LoadNuxtOptions): Promise<Nuxt>;
declare function buildNuxt(nuxt: Nuxt): Promise<any>;

declare function addAutoImport(imports: Import | Import[]): void;
declare function addAutoImportDir(_autoImportDirs: string | string[]): void;

interface ExtendConfigOptions {
    /**
     * Install plugin on dev
     *
     * @default true
     */
    dev?: boolean;
    /**
     * Install plugin on build
     *
     * @default true
     */
    build?: boolean;
}
interface ExtendWebpackConfigOptions extends ExtendConfigOptions {
    /**
     * Install plugin on server side
     *
     * @default true
     */
    server?: boolean;
    /**
     * Install plugin on client side
     *
     * @default true
     */
    client?: boolean;
    /**
     * Install plugin on modern build
     *
     * @default true
     * @deprecated Nuxt 2 only
     */
    modern?: boolean;
}
interface ExtendViteConfigOptions extends ExtendConfigOptions {
}
/**
 * Extend Webpack config
 *
 * The fallback function might be called multiple times
 * when applying to both client and server builds.
 */
declare function extendWebpackConfig(fn: ((config: Configuration) => void), options?: ExtendWebpackConfigOptions): void;
/**
 * Extend Vite config
 */
declare function extendViteConfig(fn: ((config: UserConfig) => void), options?: ExtendViteConfigOptions): void;
/**
 * Append Webpack plugin to the config.
 */
declare function addWebpackPlugin(plugin: WebpackPluginInstance, options?: ExtendWebpackConfigOptions): void;
/**
 * Append Vite plugin to the config.
 */
declare function addVitePlugin(plugin: Plugin, options?: ExtendViteConfigOptions): void;

/**
 * Check version constraints and return incompatibility issues as an array
 */
declare function checkNuxtCompatibility(constraints: NuxtCompatibility, nuxt?: Nuxt): Promise<NuxtCompatibilityIssues>;
/**
 * Check version constraints and throw a detailed error if has any, otherwise returns true
 */
declare function assertNuxtCompatibility(constraints: NuxtCompatibility, nuxt?: Nuxt): Promise<true>;
/**
 * Check version constraints and return true if passed, otherwise returns false
 */
declare function hasNuxtCompatibility(constraints: NuxtCompatibility, nuxt?: Nuxt): Promise<boolean>;
/**
 * Check if current nuxt instance is version 2 legacy
 */
declare function isNuxt2(nuxt?: Nuxt): any;
/**
 * Check if current nuxt instance is version 3
 */
declare function isNuxt3(nuxt?: Nuxt): any;
/**
 * Get nuxt version
 */
declare function getNuxtVersion(nuxt?: Nuxt | any): any;

/**
 * Register a directory to be scanned for components and imported only when used.
 *
 * Requires Nuxt 2.13+
 */
declare function addComponentsDir(dir: ComponentsDir): Promise<void>;
declare type AddComponentOptions = {
    name: string;
    filePath: string;
} & Partial<Exclude<Component, 'shortPath' | 'async' | 'level' | 'import' | 'asyncImport'>>;
/**
 * Register a directory to be scanned for components and imported only when used.
 *
 * Requires Nuxt 2.13+
 */
declare function addComponent(opts: AddComponentOptions): Promise<void>;

/** Direct access to the Nuxt context - see https://github.com/unjs/unctx. */
declare const nuxtCtx: unctx.UseContext<Nuxt>;
/**
 * Get access to Nuxt instance.
 *
 * Throws an error if Nuxt instance is unavailable.
 *
 * @example
 * ```js
 * const nuxt = useNuxt()
 * ```
 */
declare function useNuxt(): Nuxt;
/**
 * Get access to Nuxt instance.
 *
 * Returns null if Nuxt instance is unavailable.
 *
 * @example
 * ```js
 * const nuxt = tryUseNuxt()
 * if (nuxt) {
 *  // Do something
 * }
 * ```
 */
declare function tryUseNuxt(): Nuxt | null;

/**
 * Return a filter function to filter an array of paths
 */
declare function isIgnored(pathname: string): boolean;

declare function extendPages(cb: NuxtHooks['pages:extend']): void;

/**
 * Normalize a nuxt plugin object
 */
declare function normalizePlugin(plugin: NuxtPlugin | string): NuxtPlugin;
/**
 * Registers a nuxt plugin and to the plugins array.
 *
 * Note: You can use mode or .client and .server modifiers with fileName option
 * to use plugin only in client or server side.
 *
 * Note: By default plugin is prepended to the plugins array. You can use second argument to append (push) instead.
 *
 * @example
 * ```js
 * addPlugin({
 *   src: path.resolve(__dirname, 'templates/foo.js'),
 *   filename: 'foo.server.js' // [optional] only include in server bundle
 * })
 * ```
 */
interface AddPluginOptions {
    append?: boolean;
}
declare function addPlugin(_plugin: NuxtPlugin | string, opts?: AddPluginOptions): NuxtPlugin;
/**
 * Adds a template and registers as a nuxt plugin.
 */
declare function addPluginTemplate(plugin: NuxtPluginTemplate | string, opts?: AddPluginOptions): NuxtPlugin;

interface ResolvePathOptions {
    /** Base for resolving paths from. Default is Nuxt rootDir. */
    cwd?: string;
    /** An object of aliases. Default is Nuxt configured aliases. */
    alias?: Record<string, string>;
    /** The file extensions to try. Default is Nuxt configured extensions. */
    extensions?: string[];
}
/**
 * Resolve full path to a file or directory respecting Nuxt alias and extensions options
 *
 * If path could not be resolved, normalized input path will be returned
 */
declare function resolvePath(path: string, opts?: ResolvePathOptions): Promise<string>;
/**
 * Try to resolve first existing file in paths
 */
declare function findPath(paths: string | string[], opts?: ResolvePathOptions, pathType?: 'file' | 'dir'): Promise<string | null>;
/**
 * Resolve path aliases respecting Nuxt alias options
 */
declare function resolveAlias(path: string, alias?: Record<string, string>): string;
interface Resolver {
    resolve(...path: any[]): string;
    resolvePath(path: string, opts?: ResolvePathOptions): Promise<string>;
}
/**
 * Create a relative resolver
 */
declare function createResolver(base: string | URL): Resolver;
declare function resolveFiles(path: string, pattern: string | string[]): Promise<string[]>;

interface ServerMiddleware {
    route?: string;
    handler: Middleware | string;
}
/** Adds a new server middleware to the end of the server middleware array. */
declare function addServerMiddleware(middleware: ServerMiddleware): void;

/**
 * Renders given template using lodash template during build into the project buildDir
 */
declare function addTemplate(_template: NuxtTemplate | string): NuxtTemplate;
/**
 * Normalize a nuxt template object
 */
declare function normalizeTemplate(template: NuxtTemplate | string): NuxtTemplate;

declare const logger: consola.Consola;
declare function useLogger(scope?: string): consola.Consola;

interface ResolveModuleOptions {
    paths?: string | string[];
}
interface RequireModuleOptions extends ResolveModuleOptions {
    /** Clear the require cache (force fresh require) but only if not within `node_modules` */
    clearCache?: boolean;
    /** Automatically de-default the result of requiring the module. */
    interopDefault?: boolean;
}
declare function isNodeModules(id: string): boolean;
declare function clearRequireCache(id: string): void;
declare function scanRequireTree(id: string, files?: Set<string>): Set<string>;
/** Access the require cache by module id. */
declare function getRequireCacheItem(id: string): NodeModule;
/** Resolve the `package.json` file for a given module. */
declare function requireModulePkg(id: string, opts?: RequireModuleOptions): any;
/** Resolve the path of a module. */
declare function resolveModule(id: string, opts?: ResolveModuleOptions): string;
/** Try to resolve the path of a module, but don't emit an error if it can't be found. */
declare function tryResolveModule(path: string, opts?: ResolveModuleOptions): string | null;
/** Require a module and return it. */
declare function requireModule(id: string, opts?: RequireModuleOptions): any;
declare function importModule(id: string, opts?: RequireModuleOptions): Promise<any>;
declare function tryImportModule(id: string, opts?: RequireModuleOptions): Promise<any>;
/** Try to require a module, but don't emit an error if the module can't be required. */
declare function tryRequireModule(id: string, opts?: RequireModuleOptions): any;

declare function compileTemplate(template: NuxtTemplate, ctx: any): Promise<string>;
declare const templateUtils: {
    serialize: (data: any) => string;
    importName: (src: string) => string;
    importSources: (sources: string | string[], { lazy }?: {
        lazy?: boolean;
    }) => string;
};

export { AddComponentOptions, AddPluginOptions, ExtendConfigOptions, ExtendViteConfigOptions, ExtendWebpackConfigOptions, LoadNuxtConfigOptions, LoadNuxtOptions, RequireModuleOptions, ResolveModuleOptions, ResolvePathOptions, Resolver, ServerMiddleware, addAutoImport, addAutoImportDir, addComponent, addComponentsDir, addPlugin, addPluginTemplate, addServerMiddleware, addTemplate, addVitePlugin, addWebpackPlugin, assertNuxtCompatibility, buildNuxt, checkNuxtCompatibility, clearRequireCache, compileTemplate, createResolver, defineNuxtModule, extendPages, extendViteConfig, extendWebpackConfig, findPath, getNuxtVersion, getRequireCacheItem, hasNuxtCompatibility, importModule, installModule, isIgnored, isNodeModules, isNuxt2, isNuxt3, loadNuxt, loadNuxtConfig, logger, normalizePlugin, normalizeTemplate, nuxtCtx, requireModule, requireModulePkg, resolveAlias, resolveFiles, resolveModule, resolvePath, scanRequireTree, templateUtils, tryImportModule, tryRequireModule, tryResolveModule, tryUseNuxt, useLogger, useModuleContainer, useNuxt };

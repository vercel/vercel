import { ResolveOptions as ResolveOptions$1 } from 'enhanced-resolve';
import { Plugin } from 'rollup';

declare type ModuleType = 'commonjs' | 'module' | 'unknown';
interface ResolveOptions extends Partial<ResolveOptions$1> {
    /**
     * Whether to resolve esm or cjs by default
     * @default 'commonjs'
     */
    type?: ModuleType;
}
interface ResolvedId {
    id: string;
    path: string;
    type?: ModuleType;
    external?: boolean;
}
declare function resolveId(id: string, base?: string, opts?: ResolveOptions): Promise<ResolvedId>;

declare type Matcher<T = any> = RegExp | ((input: string, ctx?: T) => boolean);
declare function getProtocol(id: string): string | null;
declare function matches<T = any>(input: string, matchers: Matcher<T>[], ctx?: T): boolean;
declare function toMatcher(pattern: string): RegExp;
declare function toMatcher<T>(pattern: Matcher<T>): Matcher<T>;
declare function getType(id: string, fallback?: ModuleType): ModuleType;

interface ExternalsOptions {
    /**
     * Patterns that always will be excluded from externals
     */
    inline?: Array<string | Matcher>;
    /**
     * Patterns that match if an id/module is external
     */
    external?: Array<string | Matcher>;
    /**
     * Protocols that are allowed to be externalized.
     * Any other matched protocol will be inlined.
     *
     * Default: ['node', 'file', 'data']
     */
    externalProtocols?: Array<string>;
    /**
     * Extensions that are allowed to be externalized.
     * Any other matched extension will be inlined.
     *
     * Default: ['.js', '.mjs', '.cjs', '.node']
     */
    externalExtensions?: Array<string>;
    /**
     * Resolve options (passed directly to [`enhanced-resolve`](https://github.com/webpack/enhanced-resolve))
     */
    resolve?: Partial<ResolveOptions>;
    /**
     * Try to automatically detect and inline invalid node imports
     * matching file name (at first) and then loading code.
     */
    detectInvalidNodeImports?: boolean;
}
declare const ExternalsDefaults: ExternalsOptions;
declare function isExternal(id: string, importer: string, opts?: ExternalsOptions): Promise<null | {
    id: string;
    external: true;
}>;

declare function rollupExternals(opts: ExternalsOptions): Plugin;

declare function webpackExternals(opts: ExternalsOptions): any;

export { ExternalsDefaults, ExternalsOptions, Matcher, ModuleType, ResolveOptions, ResolvedId, getProtocol, getType, isExternal, matches, resolveId, rollupExternals, toMatcher, webpackExternals };

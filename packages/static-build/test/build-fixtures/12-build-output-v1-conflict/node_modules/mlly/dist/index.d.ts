interface ESMImport {
    type: 'static' | 'dynamic';
    code: string;
    start: number;
    end: number;
}
interface StaticImport extends ESMImport {
    type: 'static';
    imports: string;
    specifier: string;
}
interface ParsedStaticImport extends StaticImport {
    defaultImport?: string;
    namespacedImport?: string;
    namedImports?: {
        [name: string]: string;
    };
}
interface DynamicImport extends ESMImport {
    type: 'dynamic';
    expression: string;
}
interface ESMExport {
    _type?: 'declaration' | 'named' | 'default' | 'star';
    type: 'declaration' | 'named' | 'default' | 'star';
    code: string;
    start: number;
    end: number;
    name?: string;
    names: string[];
    specifier?: string;
}
interface DeclarationExport extends ESMExport {
    type: 'declaration';
    declaration: string;
    name: string;
}
interface NamedExport extends ESMExport {
    type: 'named';
    exports: string;
    names: string[];
    specifier?: string;
}
interface DefaultExport extends ESMExport {
    type: 'default';
}
declare const ESM_STATIC_IMPORT_RE: RegExp;
declare const DYNAMIC_IMPORT_RE: RegExp;
declare const EXPORT_DECAL_RE: RegExp;
declare function findStaticImports(code: string): StaticImport[];
declare function findDynamicImports(code: string): DynamicImport[];
declare function parseStaticImport(matched: StaticImport): ParsedStaticImport;
declare function findExports(code: string): ESMExport[];

interface CommonjsContext {
    __filename: string;
    __dirname: string;
    require: NodeRequire;
}
declare function createCommonJS(url: string): CommonjsContext;
declare function interopDefault(sourceModule: any): any;

interface ResolveOptions {
    url?: string | URL | (string | URL)[];
    extensions?: string[];
    conditions?: string[];
}
/**
 * @deprecated please use `resolve` instead of `resolveSync`
 */
declare function resolveSync(id: string, opts?: ResolveOptions): string;
declare function resolve(id: string, opts?: ResolveOptions): Promise<string>;
/**
 * @deprecated please use `resolvePath` instead of `resolvePathSync`
 */
declare function resolvePathSync(id: string, opts?: ResolveOptions): string;
declare function resolvePath(id: string, opts?: ResolveOptions): Promise<any>;
declare function createResolve(defaults?: ResolveOptions): (id: any, url: any) => Promise<string>;

interface EvaluateOptions extends ResolveOptions {
    url?: string;
}
declare function loadModule(id: string, opts?: EvaluateOptions): Promise<any>;
declare function evalModule(code: string, opts?: EvaluateOptions): Promise<any>;
declare function transformModule(code: string, opts?: EvaluateOptions): Promise<string>;
declare function resolveImports(code: string, opts?: EvaluateOptions): Promise<string>;

declare function hasESMSyntax(code: string): boolean;
declare function hasCJSSyntax(code: string): boolean;
declare function detectSyntax(code: string): {
    hasESM: boolean;
    hasCJS: boolean;
    isMixed: boolean;
};
interface ValidNodeImportOptions extends ResolveOptions {
    /**
     * The contents of the import, which may be analyzed to see if it contains
     * CJS or ESM syntax as a last step in checking whether it is a valid import.
     */
    code?: string;
    /**
     * Protocols that are allowed as valid node imports.
     *
     * Default: ['node', 'file', 'data']
     */
    allowedProtocols?: Array<string>;
}
declare function isValidNodeImport(id: string, _opts?: ValidNodeImportOptions): Promise<boolean>;

declare function fileURLToPath(id: string): string;
declare function sanitizeURIComponent(name?: string, replacement?: string): string;
declare function sanitizeFilePath(filePath?: string): string;
declare function normalizeid(id: string): string;
declare function loadURL(url: string): Promise<string>;
declare function toDataURL(code: string): string;
declare function isNodeBuiltin(id?: string): boolean;
declare function getProtocol(id: string): string | null;

export { CommonjsContext, DYNAMIC_IMPORT_RE, DeclarationExport, DefaultExport, DynamicImport, ESMExport, ESMImport, ESM_STATIC_IMPORT_RE, EXPORT_DECAL_RE, EvaluateOptions, NamedExport, ParsedStaticImport, ResolveOptions, StaticImport, ValidNodeImportOptions, createCommonJS, createResolve, detectSyntax, evalModule, fileURLToPath, findDynamicImports, findExports, findStaticImports, getProtocol, hasCJSSyntax, hasESMSyntax, interopDefault, isNodeBuiltin, isValidNodeImport, loadModule, loadURL, normalizeid, parseStaticImport, resolve, resolveImports, resolvePath, resolvePathSync, resolveSync, sanitizeFilePath, sanitizeURIComponent, toDataURL, transformModule };

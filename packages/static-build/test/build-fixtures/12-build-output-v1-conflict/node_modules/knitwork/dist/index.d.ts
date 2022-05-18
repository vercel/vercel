interface CodegenOptions {
    singleQuotes?: Boolean;
}

declare type ESMImport = string | {
    name: string;
    as?: string;
};
declare function genImport(specifier: string, imports?: ESMImport | ESMImport[], opts?: CodegenOptions): string;
declare function genTypeImport(specifier: string, imports: ESMImport[], opts?: CodegenOptions): string;
declare function genTypeExport(specifier: string, imports: ESMImport[], opts?: CodegenOptions): string;
declare const genInlineTypeImport: (specifier: string, name?: string, opts?: CodegenOptions) => string;
declare type ESMExport = string | {
    name: string;
    as?: string;
};
declare function genExport(specifier: string, exports?: ESMExport | ESMExport[], opts?: CodegenOptions): string;
interface DynamicImportOptions extends CodegenOptions {
    comment?: string;
    wrapper?: boolean;
    interopDefault?: boolean;
}
declare function genDynamicImport(specifier: string, opts?: DynamicImportOptions): string;

declare function genObjectFromRaw(obj: Record<string, any>, indent?: string): string;
declare function genArrayFromRaw(array: any[], indent?: string): string;
declare function genObjectFromRawEntries(array: [key: string, value: any][], indent?: string): string;

declare function genString(input: string, opts?: CodegenOptions): string;
declare function escapeString(id: string): string;

declare type TypeObject = {
    [key: string]: string | TypeObject;
};
interface GenInterfaceOptions {
    extends?: string | string[];
    export?: boolean;
}
declare const genTypeObject: (obj: TypeObject, indent?: string) => any;
declare const genInterface: (name: string, contents?: TypeObject, options?: GenInterfaceOptions) => string;
declare const genAugmentation: (specifier: string, interfaces?: Record<string, TypeObject | [TypeObject, Omit<GenInterfaceOptions, 'export'>]>) => string;

export { CodegenOptions, DynamicImportOptions, ESMExport, ESMImport, GenInterfaceOptions, TypeObject, escapeString, genArrayFromRaw, genAugmentation, genDynamicImport, genExport, genImport, genInlineTypeImport, genInterface, genObjectFromRaw, genObjectFromRawEntries, genString, genTypeExport, genTypeImport, genTypeObject };

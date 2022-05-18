declare type JSValue = string | number | bigint | boolean | symbol | Function | Array<any> | undefined | object | null;
declare type JSType = 'string' | 'number' | 'bigint' | 'boolean' | 'symbol' | 'function' | 'object' | 'any' | 'array';
declare type ResolveFn = ((value: any, get: (key: string) => any) => JSValue);
interface TypeDescriptor {
    /** Used internally to handle schema types */
    type?: JSType | JSType[];
    /** Fully resolved correct TypeScript type for generated TS declarations */
    tsType?: string;
    /** Human-readable type description for use in generated documentation */
    markdownType?: string;
    items?: TypeDescriptor | TypeDescriptor[];
}
interface FunctionArg extends TypeDescriptor {
    name?: string;
    default?: JSValue;
    optional?: boolean;
}
interface Schema extends TypeDescriptor {
    id?: string;
    default?: JSValue;
    resolve?: ResolveFn;
    properties?: {
        [key: string]: Schema;
    };
    title?: string;
    description?: string;
    $schema?: string;
    tags?: string[];
    args?: FunctionArg[];
    returns?: TypeDescriptor;
}
interface InputObject {
    [key: string]: any;
    $schema?: Schema;
    $resolve?: ResolveFn;
}
declare type InputValue = InputObject | JSValue;

declare function resolveSchema(obj: InputObject, defaults?: InputObject): Schema;
declare function applyDefaults(ref: InputObject, input: InputObject): InputObject;

interface GenerateTypesOptions {
    interfaceName?: string;
    addExport?: boolean;
    addDefaults?: boolean;
    defaultDescrption?: string;
    indentation?: number;
    allowExtraKeys?: boolean;
}
declare function generateTypes(schema: Schema, opts?: GenerateTypesOptions): string;

declare function generateMarkdown(schema: Schema): string;

export { FunctionArg, InputObject, InputValue, JSType, JSValue, ResolveFn, Schema, TypeDescriptor, applyDefaults, generateMarkdown, generateTypes, resolveSchema };

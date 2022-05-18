declare function isUppercase(char?: string): boolean;
declare function splitByCase(str: string, splitters?: string[]): string[];
declare function upperFirst(str: string): string;
declare function lowerFirst(str: string): string;
declare function pascalCase(str?: string | string[]): string;
declare function camelCase(str?: string | string[]): string;
declare function kebabCase(str?: string | string[], joiner?: string): string;
declare function snakeCase(str?: string | string[]): string;

export { camelCase, isUppercase, kebabCase, lowerFirst, pascalCase, snakeCase, splitByCase, upperFirst };

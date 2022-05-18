import { TransformResult } from 'vite';

declare const isWindows: boolean;
declare function slash(str: string): string;
declare function normalizeRequestId(id: string, base?: string): string;
declare function normalizeModuleId(id: string): string;
declare function isPrimitive(v: any): boolean;
declare function toFilePath(id: string, root: string): string;
declare function withInlineSourcemap(result: TransformResult): Promise<TransformResult>;

export { isPrimitive, isWindows, normalizeModuleId, normalizeRequestId, slash, toFilePath, withInlineSourcemap };

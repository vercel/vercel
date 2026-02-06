declare module 'tar' {
  import { Writable } from 'stream';

  export interface ExtractOptions {
    cwd?: string;
    strip?: number;
    filter?: (path: string, entry: unknown) => boolean;
    onwarn?: (code: string, message: string, data: unknown) => void;
    strict?: boolean;
    preservePaths?: boolean;
    unlink?: boolean;
    chmod?: boolean;
    maxDepth?: number;
  }

  export function extract(options?: ExtractOptions): Writable;
}

declare module '@zeit/node-file-trace' {
  interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isSymbolicLink(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
    dev: number;
    ino: number;
    mode: number;
    nlink: number;
    uid: number;
    gid: number;
    rdev: number;
    size: number;
    blksize: number;
    blocks: number;
    atimeMs: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    birthtime: Date;
  }

  export interface NodeFileTraceOptions {
    base?: string;
    ignore?: string | string[] | ((path: string) => boolean);
    ts?: boolean;
    log?: boolean;
    mixedModules?: boolean;
    readFile?: (path: string) => Buffer | string | null;
    stat?: (path: string) => Stats | null;
    readlink?: (path: string) => string | null;
  }

  export interface NodeFileTraceReasons {
    [fileName: string]: {
      type: string;
      ignored: boolean;
      parents: string[];
    };
  }

  export interface NodeFileTraceResult {
    fileList: string[];
    esmFileList: string[];
    reasons: NodeFileTraceReasons;
  }

  export default function NodeFileTrace(
    files: string[],
    opts: NodeFileTraceOptions
  ): Promise<NodeFileTraceResult>;
}

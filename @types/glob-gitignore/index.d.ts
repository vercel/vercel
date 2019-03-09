declare namespace GlobIgnore {
  export interface IOptions extends minimatch.IOptions {
      cwd?: string;
      root?: string;
      dot?: boolean;
      nomount?: boolean;
      mark?: boolean;
      nosort?: boolean;
      stat?: boolean;
      silent?: boolean;
      strict?: boolean;
      cache?: { [path: string]: boolean | 'DIR' | 'FILE' | ReadonlyArray<string> };
      statCache?: { [path: string]: false | { isDirectory(): boolean } | fs.Stat | undefined };
      symlinks?: { [path: string]: boolean | undefined };
      realpathCache?: { [path: string]: string };
      sync?: boolean;
      nounique?: boolean;
      nonull?: boolean;
      debug?: boolean;
      nobrace?: boolean;
      noglobstar?: boolean;
      noext?: boolean;
      nocase?: boolean;
      matchBase?: any;
      nodir?: boolean;
      ignore?: string | ReadonlyArray<string> | dockerignore.Ignore;
      follow?: boolean;
      realpath?: boolean;
      nonegate?: boolean;
      nocomment?: boolean;
      absolute?: boolean;
  }

  export function glob(pattern: string, options: IOptions): Promise<string[]>;
}

declare module 'glob-gitignore' {
  export = GlobIgnore;
}

declare module '@vltpkg/graph' {
  export interface LockfileData {
    lockfileVersion: number;
    options: Record<string, unknown>;
    nodes: Record<string, unknown[]>;
    edges: Record<string, string>;
  }

  export function install(options: {
    projectRoot: string;
    packageJson: unknown;
    packageInfo: unknown;
    scurry: unknown;
    allowScripts: string;
    frozenLockfile?: boolean;
    cleanInstall?: boolean;
    lockfileOnly?: boolean;
    [key: string]: unknown;
  }): Promise<{ graph: { toJSON(): LockfileData } }>;
}

declare module '@vltpkg/package-info' {
  export class PackageInfoClient {
    constructor(options?: Record<string, unknown>);
    manifest(spec: unknown, options?: Record<string, unknown>): Promise<any>;
    resolve(spec: unknown, options?: Record<string, unknown>): Promise<any>;
    tarball(spec: unknown, options?: Record<string, unknown>): Promise<Buffer>;
    extract(
      spec: unknown,
      target: string,
      options?: Record<string, unknown>
    ): Promise<any>;
  }
}

declare module '@vltpkg/package-json' {
  export class PackageJson {}
}

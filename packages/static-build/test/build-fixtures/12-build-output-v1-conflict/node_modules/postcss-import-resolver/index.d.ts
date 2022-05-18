declare namespace ImportResolver {
  interface AliasItem {
    alias: string;
    name: string;
    onlyModule?: boolean;
  }

  interface Dictionary<T> {
    [key: string]: T;
  }

  interface Plugin {
    apply(...args: any[]): void;
  }

  interface ResolverOption {
    alias?: AliasItem[] | Dictionary<string>;
    aliasFields?: string[];
    cachePredicate?: (val: Object) => boolean;
    descriptionFiles?: string[];
    enforceExtension?: boolean;
    enforceModuleExtension?: boolean;
    extensions?: string[];
    fileSystem?: Object;
    mainFields?: string[];
    mainFiles?: string[];
    moduleExtensions?: string[];
    modules?: string[];
    plugins?: Plugin[];
    resolver?: Object;
    resolveToContext?: boolean;
    symlinks?: string[] | boolean;
    unsafeCache?: boolean | Dictionary<any>;
    useSyncFileSystemCalls?: boolean;
  }
}

declare function resolver(config: ImportResolver.ResolverOption): Function

export = resolver

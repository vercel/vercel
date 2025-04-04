export interface RuntimeCache {
  delete: (key: string) => Promise<void>;
  get: (key: string) => Promise<unknown | null>;
  set: (
    key: string,
    value: unknown,
    options?: { name?: string; tags?: string[]; ttl?: number }
  ) => Promise<void>;
  revalidateTag: (tag: string | string[]) => Promise<void>;
}

export interface CacheOptions {
  keyHashFunction?: (key: string) => string;
  namespace?: string;
  namespaceSeparator?: string;
}

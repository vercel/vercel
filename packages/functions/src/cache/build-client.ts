import {
  HEADERS_VERCEL_CACHE_STATE,
  HEADERS_VERCEL_CACHE_ITEM_NAME,
  HEADERS_VERCEL_CACHE_TAGS,
  HEADERS_VERCEL_REVALIDATE,
  PkgCacheState,
} from './index';

export class BuildCache {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly onError?: (error: Error) => void | undefined;
  private readonly timeout: number;

  constructor({
    endpoint,
    headers,
    onError,
    timeout = 500,
  }: {
    endpoint: string;
    headers: Record<string, string>;
    onError?: (error: Error) => void;
    timeout?: number;
  }) {
    this.endpoint = endpoint;
    this.headers = headers;
    this.onError = onError;
    this.timeout = timeout;
  }

  public get = async (key: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.endpoint}${key}`, {
        headers: this.headers,
        method: 'GET',
        signal: controller.signal,
      });

      if (res.status === 404) {
        clearTimeout(timeoutId);
        return null;
      }
      if (res.status === 200) {
        const cacheState = res.headers.get(
          HEADERS_VERCEL_CACHE_STATE
        ) as PkgCacheState | null;
        if (cacheState !== PkgCacheState.Fresh) {
          res.body?.cancel?.();
          clearTimeout(timeoutId);
          return null;
        }
        const result = (await res.json()) as unknown;
        clearTimeout(timeoutId);
        return result;
      } else {
        clearTimeout(timeoutId);
        throw new Error(`Failed to get cache: ${res.statusText}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error(
          `Cache request timed out after ${this.timeout}ms`
        );
        timeoutError.stack = error.stack;
        this.onError?.(timeoutError);
      } else {
        this.onError?.(error);
      }
      return null;
    }
  };

  public set = async (
    key: string,
    value: unknown,
    options?: {
      name?: string;
      ttl?: number;
      tags?: string[];
    }
  ) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const optionalHeaders: Record<string, string> = {};
      if (options?.ttl) {
        optionalHeaders[HEADERS_VERCEL_REVALIDATE] = options.ttl.toString();
      }
      if (options?.tags && options.tags.length > 0) {
        optionalHeaders[HEADERS_VERCEL_CACHE_TAGS] = options.tags.join(',');
      }
      if (options?.name) {
        optionalHeaders[HEADERS_VERCEL_CACHE_ITEM_NAME] = options.name;
      }
      const res = await fetch(`${this.endpoint}${key}`, {
        method: 'POST',
        headers: {
          ...this.headers,
          ...optionalHeaders,
        },
        body: JSON.stringify(value),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status !== 200) {
        throw new Error(`Failed to set cache: ${res.status} ${res.statusText}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error(
          `Cache request timed out after ${this.timeout}ms`
        );
        timeoutError.stack = error.stack;
        this.onError?.(timeoutError);
      } else {
        this.onError?.(error);
      }
    }
  };

  public delete = async (key: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.endpoint}${key}`, {
        method: 'DELETE',
        headers: this.headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status !== 200) {
        throw new Error(`Failed to delete cache: ${res.statusText}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error(
          `Cache request timed out after ${this.timeout}ms`
        );
        timeoutError.stack = error.stack;
        this.onError?.(timeoutError);
      } else {
        this.onError?.(error);
      }
    }
  };

  public expireTag = async (tag: string | string[]) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      if (Array.isArray(tag)) {
        tag = tag.join(',');
      }
      const res = await fetch(`${this.endpoint}revalidate?tags=${tag}`, {
        method: 'POST',
        headers: this.headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status !== 200) {
        throw new Error(`Failed to revalidate tag: ${res.statusText}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error(
          `Cache request timed out after ${this.timeout}ms`
        );
        timeoutError.stack = error.stack;
        this.onError?.(timeoutError);
      } else {
        this.onError?.(error);
      }
    }
  };
}

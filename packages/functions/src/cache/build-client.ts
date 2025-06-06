const DefaultHost = '';
const DefaultHeaders: Record<string, string> = {};
const DefaultBasepath = '';
const DefaultProtocol = 'https';

export class BuildCache {
  private readonly onError: ((error: Error) => void) | undefined;
  private readonly host: string;
  private readonly headers: Record<string, string>;
  private readonly basepath;
  private readonly protocol;

  constructor({
    scBasepath,
    scHost,
    scHeaders,
    scProtocol,
    onError,
    client,
  }: {
    scBasepath?: string | null;
    scHost?: string | null;
    scHeaders?: Record<string, string>;
    scProtocol?: string | null;
    onError?: (error: Error) => void;
    client?: string | null;
  } = {}) {
    this.onError = onError;
    this.basepath = scBasepath ?? DefaultBasepath;
    this.host = scHost ?? DefaultHost;
    this.protocol = scProtocol ?? DefaultProtocol;
    this.headers = scHeaders ?? DefaultHeaders;
    this.headers['x-vercel-internal-sc-client-origin'] = 'RUNTIME_CACHE';
    this.headers['x-vercel-internal-sc-client-name'] = client ?? 'BUILD';
  }

  private getUrl = (key: string) => {
    return `${this.protocol}://${this.host}${this.basepath}/v1/suspense-cache/${key}`;
  };

  public get = async (key: string) => {
    try {
      const optionalHeaders: Record<string, string> = {};
      const res = await fetch(this.getUrl(key), {
        cache: 'no-store',
        headers: {
          ...this.headers,
          ...optionalHeaders,
        },
        method: 'GET',
      });

      if (res.status === 404) {
        return null;
      }
      if (res.status === 200) {
        const cacheState = res.headers.get('x-vercel-cache-state');
        const content = (await res.json()) as unknown;
        if (content && cacheState !== 'fresh') {
          await this.delete(key);
          return null;
        }
        if (content) {
          return content;
        }
        return null;
      } else {
        throw new Error(`Failed to get cache: ${res.statusText}`);
      }
    } catch (error: any) {
      this.onError?.(error);
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
      chunkDelayMs?: number;
    }
  ) => {
    try {
      const optionalHeaders: Record<string, string> = {};
      if (options?.ttl) {
        optionalHeaders['x-vercel-revalidate'] = options.ttl.toString();
      }
      if (options?.tags && options.tags.length > 0) {
        optionalHeaders['x-vercel-cache-tags'] = options.tags.join(',');
      }
      if (options?.name) {
        optionalHeaders['x-vercel-cache-item-name'] = options.name;
      }
      const res = await fetch(this.getUrl(key), {
        cache: 'no-store',
        method: 'POST',
        headers: {
          ...this.headers,
          ...optionalHeaders,
        },
        body: JSON.stringify(value),
      });

      if (res.status !== 200) {
        throw new Error(`Failed to set cache: ${res.status} ${res.statusText}`);
      }
    } catch (error: any) {
      this.onError?.(error);
    }
  };

  public delete = async (key: string) => {
    try {
      const res = await fetch(this.getUrl(key), {
        cache: 'no-store',
        method: 'DELETE',
        headers: {
          ...this.headers,
        },
      });

      if (res.status !== 200) {
        throw new Error(`Failed to delete cache: ${res.statusText}`);
      }
    } catch (error: any) {
      this.onError?.(error);
    }
  };

  public expireTag = async (tag: string | string[]) => {
    try {
      if (Array.isArray(tag)) {
        tag = tag.join(',');
      }
      const res = await fetch(this.getUrl(`revalidate?tags=${tag}`), {
        cache: 'no-store',
        method: 'POST',
        headers: {
          ...this.headers,
        },
      });

      if (res.status !== 200) {
        throw new Error(`Failed to revalidate tag: ${res.statusText}`);
      }
    } catch (error: any) {
      this.onError?.(error);
    }
  };
}

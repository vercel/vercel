export class BuildCache {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly onError?: (error: Error) => void | undefined;

  constructor({
    endpoint,
    headers,
    onError,
  }: {
    endpoint: string;
    headers: Record<string, string>;
    onError?: (error: Error) => void;
  }) {
    this.endpoint = endpoint;
    this.headers = headers;
    this.onError = onError;
  }

  public get = async (key: string) => {
    try {
      const res = await fetch(`${this.endpoint}${key}`, {
        headers: this.headers,
        method: 'GET',
      });

      if (res.status === 404) {
        return null;
      }
      if (res.status === 200) {
        if (res.headers.get('x-vercel-cache-state') !== 'fresh') {
          return null;
        }
        const content = (await res.json()) as unknown;
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
      const res = await fetch(`${this.endpoint}${key}`, {
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
      const res = await fetch(`${this.endpoint}${key}`, {
        method: 'DELETE',
        headers: this.headers,
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
      const res = await fetch(`${this.endpoint}revalidate?tags=${tag}`, {
        method: 'POST',
        headers: this.headers,
      });

      if (res.status !== 200) {
        throw new Error(`Failed to revalidate tag: ${res.statusText}`);
      }
    } catch (error: any) {
      this.onError?.(error);
    }
  };
}

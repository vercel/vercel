import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import { Lambda } from './lambda';

interface PrerenderOptions {
  expiration: number | false;
  lambda: Lambda;
  fallback: FileBlob | FileFsRef | FileRef | null;
  group?: number;
  bypassToken?: string | null /* optional to be non-breaking change */;
  allowQuery?: string[] | null /* optional to be non-breaking change */;
}

export class Prerender {
  public type: 'Prerender';
  public expiration: number | false;
  public lambda: Lambda;
  public fallback: FileBlob | FileFsRef | FileRef | null;
  public group?: number;
  public bypassToken: string | null;
  public allowQuery: string[] | null;

  constructor({
    expiration,
    lambda,
    fallback,
    group,
    bypassToken,
    allowQuery,
  }: PrerenderOptions) {
    this.type = 'Prerender';
    this.expiration = expiration;
    this.lambda = lambda;

    if (
      typeof group !== 'undefined' &&
      (group <= 0 || !Number.isInteger(group))
    ) {
      throw new Error(
        'The `group` argument for `Prerender` needs to be a natural number.'
      );
    }
    this.group = group;

    if (bypassToken == null) {
      this.bypassToken = null;
    } else if (typeof bypassToken === 'string') {
      if (bypassToken.length < 32) {
        // Enforce 128 bits of entropy for safety reasons (UUIDv4 size)
        throw new Error(
          'The `bypassToken` argument for `Prerender` must be 32 characters or more.'
        );
      }
      this.bypassToken = bypassToken;
    } else {
      throw new Error(
        'The `bypassToken` argument for `Prerender` must be a `string`.'
      );
    }

    if (typeof fallback === 'undefined') {
      throw new Error(
        'The `fallback` argument for `Prerender` needs to be a `FileBlob`, `FileFsRef`, `FileRef`, or null.'
      );
    }
    this.fallback = fallback;

    if (allowQuery && !Array.isArray(allowQuery)) {
      throw new Error(
        'The `allowQuery` argument for `Prerender` needs to be a string Array.'
      );
    }
    this.allowQuery = allowQuery || null;
  }
}

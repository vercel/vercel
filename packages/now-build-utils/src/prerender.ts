import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import { Lambda } from './lambda';

interface PrerenderOptions {
  expiration: number;
  lambda: Lambda;
  fallback: FileBlob | FileFsRef | FileRef;
  group?: number;
}

export class Prerender {
  public type: 'Prerender';
  public expiration: number;
  public lambda: Lambda;
  public fallback: FileBlob | FileFsRef | FileRef;
  public group?: number;

  constructor({ expiration, lambda, fallback, group }: PrerenderOptions) {
    this.type = 'Prerender';
    this.expiration = expiration;
    this.lambda = lambda;
    this.fallback = fallback;
    
    if (
      typeof group !== 'undefined' &&
      (group <= 0 || !Number.isInteger(group))
    ) {
      throw new Error('The `group` argument for `Prerender` needs to be a natural number.');
    }
    
    this.group = group;
  }
}

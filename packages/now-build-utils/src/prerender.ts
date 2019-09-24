import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import { Lambda } from './lambda';

interface PrerenderOptions {
  expiration: number;
  lambda: Lambda;
  fallback: FileBlob | FileFsRef | FileRef;
}

export class Prerender {
  public type: 'Prerender';
  public expiration: number;
  public lambda: Lambda;
  public fallback: FileBlob | FileFsRef | FileRef;

  constructor({ expiration, lambda, fallback }: PrerenderOptions) {
    this.type = 'Prerender';
    this.expiration = expiration;
    this.lambda = lambda;
    this.fallback = fallback;
  }
}

interface PrerenderGroupOptions {
  items: Array<Prerender>;
}

export class PrerenderGroup {
  public type: 'PrerenderGroup';
  public items: Array<Prerender>;

  constructor({ items }: PrerenderGroupOptions) {
    this.type = 'PrerenderGroup';
    this.items = items;
  }
}

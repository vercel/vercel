import assert from 'assert';
import fs from 'fs-extra';
import multiStream from 'multistream';
import path from 'path';
import Sema from 'async-sema';
import { FileBase } from './types';

const semaToPreventEMFILE = new Sema(20);

interface FileFsRefOptions {
  mode?: number;
  contentType?: string;
  fsPath: string;
  size?: number;
  contentHash?: string;
}

interface FromStreamOptions {
  mode: number;
  contentType?: string;
  stream: NodeJS.ReadableStream;
  fsPath: string;
}

class FileFsRef implements FileBase {
  public type: 'FileFsRef';
  public mode: number;
  public fsPath: string;
  public size?: number;
  public contentType: string | undefined;
  public contentHash?: string;

  constructor({
    mode = 0o100644,
    contentType,
    fsPath,
    size,
    contentHash,
  }: FileFsRefOptions) {
    assert(typeof mode === 'number');
    assert(typeof fsPath === 'string');
    this.type = 'FileFsRef';
    this.mode = mode;
    this.contentType = contentType;
    this.fsPath = fsPath;
    this.size = size;
    this.contentHash = contentHash;
  }

  static async fromFsPath({
    mode,
    contentType,
    fsPath,
    size,
    contentHash,
  }: FileFsRefOptions): Promise<FileFsRef> {
    let m = mode;
    let s = size;
    if (!m || typeof s === 'undefined') {
      const stat = await fs.lstat(fsPath);
      m = stat.mode;
      s = stat.size;
    }
    return new FileFsRef({
      mode: m,
      contentType,
      fsPath,
      size: s,
      contentHash,
    });
  }

  static async fromStream({
    mode = 0o100644,
    contentType,
    stream,
    fsPath,
  }: FromStreamOptions): Promise<FileFsRef> {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    assert(typeof fsPath === 'string');
    await fs.mkdirp(path.dirname(fsPath));

    await new Promise<void>((resolve, reject) => {
      const dest = fs.createWriteStream(fsPath, {
        mode: mode & 0o777,
      });
      stream.pipe(dest);
      stream.on('error', reject);
      dest.on('finish', resolve);
      dest.on('error', reject);
    });

    return FileFsRef.fromFsPath({ mode, contentType, fsPath });
  }

  async toStreamAsync(): Promise<NodeJS.ReadableStream> {
    await semaToPreventEMFILE.acquire();
    const release = () => semaToPreventEMFILE.release();
    const stream = fs.createReadStream(this.fsPath);
    stream.on('close', release);
    stream.on('error', release);
    return stream;
  }

  toStream(): NodeJS.ReadableStream {
    let flag = false;

    return multiStream(cb => {
      if (flag) return cb(null, null);
      flag = true;

      this.toStreamAsync()
        .then(stream => {
          cb(null, stream);
        })
        .catch(error => {
          cb(error, null);
        });
    });
  }
}

export default FileFsRef;

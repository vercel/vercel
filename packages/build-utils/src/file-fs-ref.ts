import assert from 'assert';
import fs from 'fs-extra';
import multiStream from 'multistream';
import path from 'path';
import Sema from 'async-sema';
import { FileBase } from './types';
import { createGracefulReadStream } from './graceful-fs';

const semaToPreventEMFILE = new Sema(20);

interface FileFsRefOptions {
  mode?: number;
  contentType?: string;
  fsPath: string;
  size?: number;
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

  /**
   * Counter tracking EMFILE/ENFILE errors encountered by this instance.
   * Consuming services can read this to monitor file descriptor pressure.
   */
  public emfileErrorCount = 0;

  constructor({
    mode = 0o100644,
    contentType,
    fsPath,
    size,
  }: FileFsRefOptions) {
    assert(typeof mode === 'number');
    assert(typeof fsPath === 'string');
    this.type = 'FileFsRef';
    this.mode = mode;
    this.contentType = contentType;
    this.fsPath = fsPath;
    this.size = size;
  }

  static async fromFsPath({
    mode,
    contentType,
    fsPath,
    size,
  }: FileFsRefOptions): Promise<FileFsRef> {
    let m = mode;
    let s = size;
    if (!m || typeof s === 'undefined') {
      const stat = await fs.lstat(fsPath);
      m = stat.mode;
      s = stat.size;
    }
    return new FileFsRef({ mode: m, contentType, fsPath, size: s });
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
    if (process.env.VERCEL_BUILD_UTILS_GRACEFUL_FS_OPEN === '1') {
      return createGracefulReadStream(this.fsPath, () => {
        this.emfileErrorCount++;
      });
    }

    // Existing semaphore-based implementation
    await semaToPreventEMFILE.acquire();
    const release = () => semaToPreventEMFILE.release();
    const stream = fs.createReadStream(this.fsPath);
    stream.on('close', release);
    stream.on('error', (err: NodeJS.ErrnoException) => {
      // Track EMFILE/ENFILE errors even with semaphore approach for comparison during rollout
      if (err.code === 'EMFILE' || err.code === 'ENFILE') {
        this.emfileErrorCount++;
      }
      release();
    });
    return stream;
  }

  toStream(): NodeJS.ReadableStream {
    let flag = false;

    // eslint-disable-next-line consistent-return
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

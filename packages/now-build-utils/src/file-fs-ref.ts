import assert from 'assert';
import fs from 'fs-extra';
import multiStream from 'multistream';
import path from 'path';
import Sema from 'async-sema';
import { File } from './types';

const semaToPreventEMFILE = new Sema(30);

interface FileFsRefOptions {
  mode?: number;
  fsPath: string;
}

interface FromOptions {
  fsPath: string;
}

interface FromStreamOptions {
  mode: number;
  stream: NodeJS.ReadableStream;
  fsPath: string;
}

class FileFsRef implements File {
  public type: 'FileFsRef';
  public mode: number;
  public fsPath: string;

  constructor({ mode = 0o100644, fsPath }: FileFsRefOptions) {
    assert(typeof mode === 'number');
    assert(typeof fsPath === 'string');
    this.type = 'FileFsRef';
    this.mode = mode;
    this.fsPath = fsPath;
  }

  static async fromFsPath({ fsPath }: FromOptions): Promise<FileFsRef> {
    const { mode } = await fs.lstat(fsPath);
    return new FileFsRef({ mode, fsPath });
  }

  static async fromStream({ mode = 0o100644, stream, fsPath }: FromStreamOptions): Promise<FileFsRef> {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    assert(typeof fsPath === 'string');
    await fs.mkdirp(path.dirname(fsPath));

    await new Promise<void>((resolve, reject) => {
      const dest = fs.createWriteStream(fsPath);
      stream.pipe(dest);
      stream.on('error', reject);
      dest.on('finish', resolve);
      dest.on('error', reject);
    });

    await fs.chmod(fsPath, mode.toString(8).slice(-3));
    return new FileFsRef({ mode, fsPath });
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

    // eslint-disable-next-line consistent-return
    return multiStream((cb) => {
      if (flag) return cb(null, null);
      flag = true;

      this.toStreamAsync()
        .then((stream) => {
          cb(null, stream);
        })
        .catch((error) => {
          cb(error, null);
        });
    });
  }
}

export = FileFsRef;

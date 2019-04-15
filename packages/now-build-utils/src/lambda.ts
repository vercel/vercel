import assert from 'assert';
import Sema from 'async-sema';
import { ZipFile } from 'yazl';
import { readlink } from 'fs-extra';
import { Files } from './types';
import FileFsRef from './file-fs-ref';
import { isSymbolicLink } from './fs/download';
import streamToBuffer from './fs/stream-to-buffer';

interface Environment {
  [key: string]: string;
}

interface LambdaOptions {
  zipBuffer: Buffer;
  handler: string;
  runtime: string;
  environment: Environment;
}

interface CreateLambdaOptions {
  files: Files;
  handler: string;
  runtime: string;
  environment?: Environment;
}

export class Lambda {
  public type: 'Lambda';
  public zipBuffer: Buffer;
  public handler: string;
  public runtime: string;
  public environment: Environment;

  constructor({
    zipBuffer, handler, runtime, environment,
  }: LambdaOptions) {
    this.type = 'Lambda';
    this.zipBuffer = zipBuffer;
    this.handler = handler;
    this.runtime = runtime;
    this.environment = environment;
  }
}

const sema = new Sema(10);
const mtime = new Date(1540000000000);

export async function createLambda({
  files, handler, runtime, environment = {},
}: CreateLambdaOptions): Promise<Lambda> {
  assert(typeof files === 'object', '"files" must be an object');
  assert(typeof handler === 'string', '"handler" is not a string');
  assert(typeof runtime === 'string', '"runtime" is not a string');
  assert(typeof environment === 'object', '"environment" is not an object');

  await sema.acquire();

  try {
    const zipBuffer = await createZip(files);
    return new Lambda({
      zipBuffer,
      handler,
      runtime,
      environment,
    });
  } finally {
    sema.release();
  }
}

export async function createZip(files: Files): Promise<Buffer> {
  const names = Object.keys(files).sort();

  const symlinkTargets = new Map<string, string>();
  for (const name of names) {
    const file = files[name];
    if (file.mode && isSymbolicLink(file.mode) && file.type === 'FileFsRef') {
      const symlinkTarget = await readlink((file as FileFsRef).fsPath);
      symlinkTargets.set(name, symlinkTarget);
    }
  }

  const zipFile = new ZipFile();
  const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
    for (const name of names) {
      const file = files[name];
      const opts = { mode: file.mode, mtime };
      const symlinkTarget = symlinkTargets.get(name);
      if (typeof symlinkTarget === 'string') {
        zipFile.addBuffer(Buffer.from(symlinkTarget, 'utf8'), name, opts);
      } else {
        const stream = file.toStream() as import('stream').Readable;
        stream.on('error', reject);
        zipFile.addReadStream(stream, name, opts);
      }
    }

    zipFile.end();
    streamToBuffer(zipFile.outputStream).then(resolve).catch(reject);
  });

  return zipBuffer;
}

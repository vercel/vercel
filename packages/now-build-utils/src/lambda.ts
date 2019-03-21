import assert from 'assert';
import Sema from 'async-sema';
import { ZipFile } from 'yazl';
import streamToBuffer from './fs/stream-to-buffer';
import { Files } from './types';

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
  public type: string;
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
    const zipFile = new ZipFile();
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      Object.keys(files)
        .sort()
        .forEach((name) => {
          const file = files[name];
          const stream = file.toStream() as import('stream').Readable;
          stream.on('error', reject);
          zipFile.addReadStream(stream, name, { mode: file.mode, mtime });
        });

      zipFile.end();
      streamToBuffer(zipFile.outputStream).then(resolve).catch(reject);
    });

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

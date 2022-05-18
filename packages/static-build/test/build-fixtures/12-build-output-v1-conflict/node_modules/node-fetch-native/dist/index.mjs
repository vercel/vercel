import { _ as _Blob, F as File$1, n as nodeDomexception, a as FormData$1, f as fetch$1, H as Headers$1, R as Request$1, b as Response$1, A as AbortController$1 } from './chunks/abort-controller.mjs';
export { c as AbortError, d as FetchError, i as isRedirect } from './chunks/abort-controller.mjs';
import { statSync, createReadStream, promises } from 'node:fs';
import { basename } from 'node:path';
import 'node:http';
import 'node:https';
import 'node:zlib';
import 'node:stream';
import 'node:buffer';
import 'node:util';
import 'node:url';
import 'node:net';

const { stat } = promises;

/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 */
const blobFromSync = (path, type) => fromBlob(statSync(path), path, type);

/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 * @returns {Promise<Blob>}
 */
const blobFrom = (path, type) => stat(path).then(stat => fromBlob(stat, path, type));

/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 * @returns {Promise<File>}
 */
const fileFrom = (path, type) => stat(path).then(stat => fromFile(stat, path, type));

/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 */
const fileFromSync = (path, type) => fromFile(statSync(path), path, type);

// @ts-ignore
const fromBlob = (stat, path, type = '') => new _Blob([new BlobDataItem({
  path,
  size: stat.size,
  lastModified: stat.mtimeMs,
  start: 0
})], { type });

// @ts-ignore
const fromFile = (stat, path, type = '') => new File$1([new BlobDataItem({
  path,
  size: stat.size,
  lastModified: stat.mtimeMs,
  start: 0
})], basename(path), { type, lastModified: stat.mtimeMs });

/**
 * This is a blob backed up by a file on the disk
 * with minium requirement. Its wrapped around a Blob as a blobPart
 * so you have no direct access to this.
 *
 * @private
 */
class BlobDataItem {
  #path
  #start

  constructor (options) {
    this.#path = options.path;
    this.#start = options.start;
    this.size = options.size;
    this.lastModified = options.lastModified;
    this.originalSize = options.originalSize === undefined
      ? options.size
      : options.originalSize;
  }

  /**
   * Slicing arguments is first validated and formatted
   * to not be out of range by Blob.prototype.slice
   */
  slice (start, end) {
    return new BlobDataItem({
      path: this.#path,
      lastModified: this.lastModified,
      originalSize: this.originalSize,
      size: end - start,
      start: this.#start + start
    })
  }

  async * stream () {
    const { mtimeMs, size } = await stat(this.#path);

    if (mtimeMs > this.lastModified || this.originalSize !== size) {
      throw new nodeDomexception('The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.', 'NotReadableError')
    }

    yield * createReadStream(this.#path, {
      start: this.#start,
      end: this.#start + this.size - 1
    });
  }

  get [Symbol.toStringTag] () {
    return 'Blob'
  }
}

const fetch = globalThis.fetch || fetch$1;
const Blob = globalThis.Blob || _Blob;
const File = globalThis.File || File$1;
const FormData = globalThis.FormData || FormData$1;
const Headers = globalThis.Headers || Headers$1;
const Request = globalThis.Request || Request$1;
const Response = globalThis.Response || Response$1;
const AbortController = globalThis.AbortController || AbortController$1;

export { AbortController, Blob, File, FormData, Headers, Request, Response, blobFrom, blobFromSync, fetch as default, fetch, fileFrom, fileFromSync };

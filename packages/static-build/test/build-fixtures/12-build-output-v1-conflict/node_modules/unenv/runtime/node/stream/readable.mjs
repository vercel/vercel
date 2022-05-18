import { EventEmitter } from "events";
export class Readable extends EventEmitter {
  constructor(_opts) {
    super();
    this.readableEncoding = null;
    this.readableEnded = true;
    this.readableFlowing = false;
    this.readableHighWaterMark = 0;
    this.readableLength = 0;
    this.readableObjectMode = false;
    this.readableAborted = false;
    this.readableDidRead = false;
    this.readable = false;
    this.destroyed = false;
  }
  static from(_iterable, options) {
    return new Readable(options);
  }
  _read(_size) {
  }
  read(_size) {
  }
  setEncoding(_encoding) {
    return this;
  }
  pause() {
    return this;
  }
  resume() {
    return this;
  }
  isPaused() {
    return true;
  }
  unpipe(_destination) {
    return this;
  }
  unshift(_chunk, _encoding) {
  }
  wrap(_oldStream) {
    return this;
  }
  push(_chunk, _encoding) {
    return false;
  }
  _destroy(_error, _callback) {
    this.removeAllListeners();
  }
  destroy(error) {
    this.destroyed = true;
    this._destroy(error);
    return this;
  }
  pipe(_destenition, _options) {
    return {};
  }
  async *[Symbol.asyncIterator]() {
  }
}

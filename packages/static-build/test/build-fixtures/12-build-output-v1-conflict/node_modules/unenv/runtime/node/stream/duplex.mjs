import { Readable } from "./readable.mjs";
import { Writable } from "./writable.mjs";
import { mergeFns } from "../../_internal/utils.mjs";
export const Duplex = class {
  constructor(readable = new Readable(), writable = new Writable()) {
    this.allowHalfOpen = true;
    Object.assign(this, readable);
    Object.assign(this, writable);
    this._destroy = mergeFns(readable._destroy, writable._destroy);
  }
};
Object.assign(Duplex.prototype, Readable.prototype);
Object.assign(Duplex.prototype, Writable.prototype);

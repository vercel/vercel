import { Socket } from "../net/socket.mjs";
import { Readable } from "../stream/readable.mjs";
import { rawHeaders } from "../../_internal/utils.mjs";
export class IncomingMessage extends Readable {
  constructor(socket) {
    super();
    this.aborted = false;
    this.httpVersion = "1.1";
    this.httpVersionMajor = 1;
    this.httpVersionMinor = 1;
    this.complete = true;
    this.headers = {};
    this.trailers = {};
    this.method = "GET";
    this.url = "/";
    this.statusCode = 200;
    this.statusMessage = "";
    this.readable = false;
    this.socket = this.connection = socket || new Socket();
  }
  get rawHeaders() {
    return rawHeaders(this.headers);
  }
  get rawTrailers() {
    return [];
  }
  setTimeout(_msecs, _callback) {
    return this;
  }
}

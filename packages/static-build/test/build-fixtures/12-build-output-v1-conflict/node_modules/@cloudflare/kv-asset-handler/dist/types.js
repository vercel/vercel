"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.NotFoundError = exports.MethodNotAllowedError = exports.KVError = void 0;
class KVError extends Error {
    constructor(message, status = 500) {
        super(message);
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
        this.name = KVError.name; // stack traces display correctly now
        this.status = status;
    }
}
exports.KVError = KVError;
class MethodNotAllowedError extends KVError {
    constructor(message = `Not a valid request method`, status = 405) {
        super(message, status);
    }
}
exports.MethodNotAllowedError = MethodNotAllowedError;
class NotFoundError extends KVError {
    constructor(message = `Not Found`, status = 404) {
        super(message, status);
    }
}
exports.NotFoundError = NotFoundError;
class InternalError extends KVError {
    constructor(message = `Internal Error in KV Asset Handler`, status = 500) {
        super(message, status);
    }
}
exports.InternalError = InternalError;

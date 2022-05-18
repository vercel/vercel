export declare const INSPECT_MAX_BYTES = 50;
export declare const kMaxLength = 2147483647;
/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */
export declare function Buffer(arg: any, encodingOrOffset: any, length: any): any;
export declare namespace Buffer {
    var TYPED_ARRAY_SUPPORT: boolean;
    var poolSize: number;
    var from: (value: any, encodingOrOffset: any, length: any) => any;
    var alloc: (size: any, fill: any, encoding: any) => Uint8Array;
    var allocUnsafe: (size: any) => Uint8Array;
    var allocUnsafeSlow: (size: any) => Uint8Array;
    var isBuffer: (b: any) => boolean;
    var compare: (a: any, b: any) => 0 | 1 | -1;
    var isEncoding: (encoding: any) => boolean;
    var concat: (list: any, length: any) => Uint8Array;
    var byteLength: (string: any, encoding: any) => any;
}
export declare function SlowBuffer(length: any): Uint8Array;

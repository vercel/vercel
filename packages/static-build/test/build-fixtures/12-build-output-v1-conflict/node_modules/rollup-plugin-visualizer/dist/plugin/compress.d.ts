import * as zlib from "zlib";
export declare type SizeGetter = (code: string) => Promise<number>;
export declare const createGzipSizeGetter: (options: zlib.ZlibOptions) => SizeGetter;
export declare const createBrotliSizeGetter: (options: zlib.BrotliOptions) => SizeGetter;

/// <reference types="node" />
import type * as stream from 'stream';
import { Duplex } from './duplex';
export declare class Transform extends Duplex implements stream.Transform {
    _transform(chunk: any, encoding: globalThis.BufferEncoding, callback: stream.TransformCallback): void;
    _flush(callback: stream.TransformCallback): void;
}

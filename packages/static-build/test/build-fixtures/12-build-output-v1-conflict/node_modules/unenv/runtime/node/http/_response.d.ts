/// <reference types="node" />
import type http from 'http';
import type { Socket } from 'net';
import { Callback, HeadersObject } from '../../_internal/types';
import { Writable } from '../stream/writable';
export declare class ServerResponse extends Writable implements http.ServerResponse {
    statusCode: number;
    statusMessage: string;
    upgrading: boolean;
    chunkedEncoding: boolean;
    shouldKeepAlive: boolean;
    useChunkedEncodingByDefault: boolean;
    sendDate: boolean;
    finished: boolean;
    headersSent: boolean;
    connection: Socket | null;
    socket: Socket | null;
    req: http.IncomingMessage;
    _headers: HeadersObject;
    constructor(req: http.IncomingMessage);
    assignSocket(socket: Socket): void;
    _flush(): void;
    detachSocket(_socket: Socket): void;
    writeContinue(_callback?: Callback): void;
    writeHead(statusCode: number, arg1?: string | http.OutgoingHttpHeaders | http.OutgoingHttpHeader[], arg2?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]): this;
    writeProcessing(): void;
    setTimeout(_msecs: number, _callback?: Callback): this;
    setHeader(name: string, value: number | string | ReadonlyArray<string>): this;
    getHeader(name: string): number | string | string[] | undefined;
    getHeaders(): http.OutgoingHttpHeaders;
    getHeaderNames(): string[];
    hasHeader(name: string): boolean;
    removeHeader(name: string): void;
    addTrailers(_headers: http.OutgoingHttpHeaders | ReadonlyArray<[string, string]>): void;
    flushHeaders(): void;
}

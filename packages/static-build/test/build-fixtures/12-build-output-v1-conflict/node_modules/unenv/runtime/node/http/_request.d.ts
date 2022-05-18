import type http from 'http';
import { Socket } from '../net/socket';
import { Readable } from '../stream/readable';
export declare class IncomingMessage extends Readable implements http.IncomingMessage {
    aborted: boolean;
    httpVersion: string;
    httpVersionMajor: number;
    httpVersionMinor: number;
    complete: boolean;
    connection: Socket;
    socket: Socket;
    headers: http.IncomingHttpHeaders;
    trailers: {};
    method: string;
    url: string;
    statusCode: number;
    statusMessage: string;
    readable: boolean;
    constructor(socket?: Socket);
    get rawHeaders(): any[];
    get rawTrailers(): any[];
    setTimeout(_msecs: number, _callback?: () => void): this;
}

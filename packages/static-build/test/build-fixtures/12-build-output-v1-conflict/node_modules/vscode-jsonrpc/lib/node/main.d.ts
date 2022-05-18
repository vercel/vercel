/// <reference types="node" />
import RAL from '../common/ral';
import { AbstractMessageReader, DataCallback, AbstractMessageWriter, Message, ReadableStreamMessageReader, WriteableStreamMessageWriter, MessageWriterOptions, MessageReaderOptions, MessageReader, MessageWriter, ConnectionStrategy, ConnectionOptions, MessageConnection, Logger, Disposable } from '../common/api';
import { ChildProcess } from 'child_process';
import { Socket } from 'net';
export * from '../common/api';
export declare class IPCMessageReader extends AbstractMessageReader {
    private process;
    constructor(process: NodeJS.Process | ChildProcess);
    listen(callback: DataCallback): Disposable;
}
export declare class IPCMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private process;
    private errorCount;
    constructor(process: NodeJS.Process | ChildProcess);
    write(msg: Message): Promise<void>;
    private handleError;
    end(): void;
}
export declare class SocketMessageReader extends ReadableStreamMessageReader {
    constructor(socket: Socket, encoding?: RAL.MessageBufferEncoding);
}
export declare class SocketMessageWriter extends WriteableStreamMessageWriter {
    private socket;
    constructor(socket: Socket, options?: RAL.MessageBufferEncoding | MessageWriterOptions);
    dispose(): void;
}
export declare class StreamMessageReader extends ReadableStreamMessageReader {
    constructor(readble: NodeJS.ReadableStream, encoding?: RAL.MessageBufferEncoding | MessageReaderOptions);
}
export declare class StreamMessageWriter extends WriteableStreamMessageWriter {
    constructor(writable: NodeJS.WritableStream, options?: RAL.MessageBufferEncoding | MessageWriterOptions);
}
export declare function generateRandomPipeName(): string;
export interface PipeTransport {
    onConnected(): Promise<[MessageReader, MessageWriter]>;
}
export declare function createClientPipeTransport(pipeName: string, encoding?: RAL.MessageBufferEncoding): Promise<PipeTransport>;
export declare function createServerPipeTransport(pipeName: string, encoding?: RAL.MessageBufferEncoding): [MessageReader, MessageWriter];
export interface SocketTransport {
    onConnected(): Promise<[MessageReader, MessageWriter]>;
}
export declare function createClientSocketTransport(port: number, encoding?: RAL.MessageBufferEncoding): Promise<SocketTransport>;
export declare function createServerSocketTransport(port: number, encoding?: RAL.MessageBufferEncoding): [MessageReader, MessageWriter];
export declare function createMessageConnection(reader: MessageReader, writer: MessageWriter, logger?: Logger, options?: ConnectionStrategy | ConnectionOptions): MessageConnection;
export declare function createMessageConnection(inputStream: NodeJS.ReadableStream, outputStream: NodeJS.WritableStream, logger?: Logger, options?: ConnectionStrategy | ConnectionOptions): MessageConnection;

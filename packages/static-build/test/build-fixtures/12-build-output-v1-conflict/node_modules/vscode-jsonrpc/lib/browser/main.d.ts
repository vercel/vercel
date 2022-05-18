import { AbstractMessageReader, DataCallback, AbstractMessageWriter, Message, Disposable, ConnectionStrategy, ConnectionOptions, MessageReader, MessageWriter, Logger, MessageConnection } from '../common/api';
export * from '../common/api';
export declare class BrowserMessageReader extends AbstractMessageReader implements MessageReader {
    private _onData;
    private _messageListener;
    constructor(context: Worker | DedicatedWorkerGlobalScope);
    listen(callback: DataCallback): Disposable;
}
export declare class BrowserMessageWriter extends AbstractMessageWriter implements MessageWriter {
    private context;
    private errorCount;
    constructor(context: Worker | DedicatedWorkerGlobalScope);
    write(msg: Message): Promise<void>;
    private handleError;
    end(): void;
}
export declare function createMessageConnection(reader: MessageReader, writer: MessageWriter, logger?: Logger, options?: ConnectionStrategy | ConnectionOptions): MessageConnection;

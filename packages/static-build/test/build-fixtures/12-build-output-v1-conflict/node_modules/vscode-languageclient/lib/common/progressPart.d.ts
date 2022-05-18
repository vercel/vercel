import { Disposable } from 'vscode';
import { ProgressToken, ProgressType, NotificationHandler, ProtocolNotificationType } from 'vscode-languageserver-protocol';
export interface ProgressContext {
    onProgress<P>(type: ProgressType<P>, token: string | number, handler: NotificationHandler<P>): Disposable;
    sendNotification<P, RO>(type: ProtocolNotificationType<P, RO>, params?: P): void;
}
export declare class ProgressPart {
    private _client;
    private _token;
    private _infinite;
    private _reported;
    private _progress;
    private _cancellationToken;
    private _disposable;
    private _resolve;
    private _reject;
    constructor(_client: ProgressContext, _token: ProgressToken, done?: (part: ProgressPart) => void);
    private begin;
    private report;
    cancel(): void;
    done(): void;
}

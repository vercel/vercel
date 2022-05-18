import * as code from 'vscode';
import * as proto from 'vscode-languageserver-protocol';
import { DynamicFeature, BaseLanguageClient, RegistrationData, NextSignature } from './client';
/**
 * File operation middleware
 *
 * @since 3.16.0
 */
export interface FileOperationsMiddleware {
    didCreateFiles?: NextSignature<code.FileCreateEvent, void>;
    willCreateFiles?: NextSignature<code.FileCreateEvent, Thenable<code.WorkspaceEdit | null | undefined>>;
    didRenameFiles?: NextSignature<code.FileRenameEvent, void>;
    willRenameFiles?: NextSignature<code.FileRenameEvent, Thenable<code.WorkspaceEdit | null | undefined>>;
    didDeleteFiles?: NextSignature<code.FileDeleteEvent, void>;
    willDeleteFiles?: NextSignature<code.FileDeleteEvent, Thenable<code.WorkspaceEdit | null | undefined>>;
}
interface Event<I> {
    readonly files: ReadonlyArray<I>;
}
declare abstract class FileOperationFeature<I, E extends Event<I>> implements DynamicFeature<proto.FileOperationRegistrationOptions> {
    protected _client: BaseLanguageClient;
    private _event;
    private _registrationType;
    private _clientCapability;
    private _serverCapability;
    private _listener;
    private _filters;
    constructor(client: BaseLanguageClient, event: code.Event<E>, registrationType: proto.RegistrationType<proto.FileOperationRegistrationOptions>, clientCapability: keyof proto.FileOperationClientCapabilities, serverCapability: keyof proto.FileOperationOptions);
    get registrationType(): proto.RegistrationType<proto.FileOperationRegistrationOptions>;
    fillClientCapabilities(capabilities: proto.ClientCapabilities): void;
    initialize(capabilities: proto.ServerCapabilities): void;
    register(data: RegistrationData<proto.FileOperationRegistrationOptions>): void;
    abstract send(data: E): Promise<void>;
    unregister(id: string): void;
    dispose(): void;
    protected filter(event: E, prop: (i: I) => code.Uri): Promise<E>;
    private static getFileType;
    private static asMinimatchOptions;
}
declare abstract class NotificationFileOperationFeature<I, E extends {
    readonly files: ReadonlyArray<I>;
}, P> extends FileOperationFeature<I, E> {
    private _notificationType;
    private _accessUri;
    private _createParams;
    constructor(client: BaseLanguageClient, event: code.Event<E>, notificationType: proto.ProtocolNotificationType<P, proto.FileOperationRegistrationOptions>, clientCapability: keyof proto.FileOperationClientCapabilities, serverCapability: keyof proto.FileOperationOptions, accessUri: (i: I) => code.Uri, createParams: (e: E) => P);
    send(originalEvent: E): Promise<void>;
    protected abstract doSend(event: E, next: (event: E) => void): void;
}
export declare class DidCreateFilesFeature extends NotificationFileOperationFeature<code.Uri, code.FileCreateEvent, proto.CreateFilesParams> {
    constructor(client: BaseLanguageClient);
    protected doSend(event: code.FileCreateEvent, next: (event: code.FileCreateEvent) => void): void;
}
export declare class DidRenameFilesFeature extends NotificationFileOperationFeature<{
    oldUri: code.Uri;
    newUri: code.Uri;
}, code.FileRenameEvent, proto.RenameFilesParams> {
    constructor(client: BaseLanguageClient);
    protected doSend(event: code.FileRenameEvent, next: (event: code.FileRenameEvent) => void): void;
}
export declare class DidDeleteFilesFeature extends NotificationFileOperationFeature<code.Uri, code.FileDeleteEvent, proto.DeleteFilesParams> {
    constructor(client: BaseLanguageClient);
    protected doSend(event: code.FileCreateEvent, next: (event: code.FileCreateEvent) => void): void;
}
interface RequestEvent<I> {
    readonly files: ReadonlyArray<I>;
    waitUntil(thenable: Thenable<code.WorkspaceEdit>): void;
    waitUntil(thenable: Thenable<any>): void;
}
declare abstract class RequestFileOperationFeature<I, E extends RequestEvent<I>, P> extends FileOperationFeature<I, E> {
    private _requestType;
    private _accessUri;
    private _createParams;
    constructor(client: BaseLanguageClient, event: code.Event<E>, requestType: proto.ProtocolRequestType<P, proto.WorkspaceEdit | null, never, void, proto.FileOperationRegistrationOptions>, clientCapability: keyof proto.FileOperationClientCapabilities, serverCapability: keyof proto.FileOperationOptions, accessUri: (i: I) => code.Uri, createParams: (e: Event<I>) => P);
    send(originalEvent: E & RequestEvent<I>): Promise<void>;
    private waitUntil;
    protected abstract doSend(event: E, next: (event: Event<I>) => Thenable<code.WorkspaceEdit> | Thenable<any>): Thenable<code.WorkspaceEdit> | Thenable<any>;
}
export declare class WillCreateFilesFeature extends RequestFileOperationFeature<code.Uri, code.FileWillCreateEvent, proto.CreateFilesParams> {
    constructor(client: BaseLanguageClient);
    protected doSend(event: code.FileWillCreateEvent, next: (event: code.FileCreateEvent) => Thenable<code.WorkspaceEdit> | Thenable<any>): Thenable<code.WorkspaceEdit> | Thenable<any>;
}
export declare class WillRenameFilesFeature extends RequestFileOperationFeature<{
    oldUri: code.Uri;
    newUri: code.Uri;
}, code.FileWillRenameEvent, proto.RenameFilesParams> {
    constructor(client: BaseLanguageClient);
    protected doSend(event: code.FileWillRenameEvent, next: (event: code.FileRenameEvent) => Thenable<code.WorkspaceEdit> | Thenable<any>): Thenable<code.WorkspaceEdit> | Thenable<any>;
}
export declare class WillDeleteFilesFeature extends RequestFileOperationFeature<code.Uri, code.FileWillDeleteEvent, proto.DeleteFilesParams> {
    constructor(client: BaseLanguageClient);
    protected doSend(event: code.FileWillDeleteEvent, next: (event: code.FileDeleteEvent) => Thenable<code.WorkspaceEdit> | Thenable<any>): Thenable<code.WorkspaceEdit> | Thenable<any>;
}
export {};

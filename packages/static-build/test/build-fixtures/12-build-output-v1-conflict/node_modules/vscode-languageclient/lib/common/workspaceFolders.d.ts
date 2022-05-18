import { WorkspaceFolder as VWorkspaceFolder, WorkspaceFoldersChangeEvent as VWorkspaceFoldersChangeEvent } from 'vscode';
import { DynamicFeature, RegistrationData, BaseLanguageClient, NextSignature } from './client';
import { ClientCapabilities, InitializeParams, ServerCapabilities, WorkspaceFoldersRequest, RegistrationType } from 'vscode-languageserver-protocol';
export declare function arrayDiff<T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): T[];
export interface WorkspaceFolderWorkspaceMiddleware {
    workspaceFolders?: WorkspaceFoldersRequest.MiddlewareSignature;
    didChangeWorkspaceFolders?: NextSignature<VWorkspaceFoldersChangeEvent, void>;
}
export declare class WorkspaceFoldersFeature implements DynamicFeature<void> {
    private _client;
    private _listeners;
    private _initialFolders;
    constructor(_client: BaseLanguageClient);
    get registrationType(): RegistrationType<void>;
    fillInitializeParams(params: InitializeParams): void;
    protected initializeWithFolders(currentWorkspaceFolders: ReadonlyArray<VWorkspaceFolder> | undefined): void;
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities): void;
    protected sendInitialEvent(currentWorkspaceFolders: ReadonlyArray<VWorkspaceFolder> | undefined): void;
    private doSendEvent;
    register(data: RegistrationData<undefined>): void;
    unregister(id: string): void;
    dispose(): void;
    private asProtocol;
}

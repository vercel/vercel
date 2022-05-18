import { TextDocumentChangeEvent, TextDocument, Disposable, OutputChannel, FileSystemWatcher as VFileSystemWatcher, DiagnosticCollection, Diagnostic as VDiagnostic, Uri, ProviderResult, CancellationToken, Position as VPosition, Location as VLocation, Range as VRange, CompletionItem as VCompletionItem, CompletionList as VCompletionList, SignatureHelp as VSignatureHelp, SignatureHelpContext as VSignatureHelpContext, Definition as VDefinition, DefinitionLink as VDefinitionLink, DocumentHighlight as VDocumentHighlight, SymbolInformation as VSymbolInformation, CodeActionContext as VCodeActionContext, Command as VCommand, CodeLens as VCodeLens, FormattingOptions as VFormattingOptions, TextEdit as VTextEdit, WorkspaceEdit as VWorkspaceEdit, Hover as VHover, CodeAction as VCodeAction, DocumentSymbol as VDocumentSymbol, DocumentLink as VDocumentLink, TextDocumentWillSaveEvent, WorkspaceFolder as VWorkspaceFolder, CompletionContext as VCompletionContext, CompletionItemProvider, HoverProvider, SignatureHelpProvider, DefinitionProvider, ReferenceProvider, DocumentHighlightProvider, CodeActionProvider, DocumentSymbolProvider, DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider, RenameProvider, DocumentLinkProvider, DocumentColorProvider, DeclarationProvider, FoldingRangeProvider, ImplementationProvider, SelectionRangeProvider, TypeDefinitionProvider, WorkspaceSymbolProvider, CallHierarchyProvider, FileWillCreateEvent, FileWillRenameEvent, FileWillDeleteEvent, FileCreateEvent, FileDeleteEvent, FileRenameEvent, LinkedEditingRangeProvider } from 'vscode';
import { Message, MessageSignature, ResponseError, RequestType0, RequestType, NotificationType0, NotificationType, ProtocolRequestType, ProtocolRequestType0, RequestHandler, RequestHandler0, GenericRequestHandler, ProtocolNotificationType, ProtocolNotificationType0, NotificationHandler, NotificationHandler0, GenericNotificationHandler, MessageReader, MessageWriter, Trace, Event, ClientCapabilities, TextDocumentRegistrationOptions, InitializeParams, InitializeResult, InitializeError, ServerCapabilities, DocumentSelector, DidOpenTextDocumentNotification, DidChangeTextDocumentNotification, DidCloseTextDocumentNotification, DidSaveTextDocumentNotification, WillSaveTextDocumentNotification, WillSaveTextDocumentWaitUntilRequest, FileEvent, CompletionRequest, HoverRequest, SignatureHelpRequest, DefinitionRequest, ReferencesRequest, DocumentHighlightRequest, DocumentSymbolRequest, WorkspaceSymbolRequest, CodeActionRequest, DocumentFormattingRequest, DocumentRangeFormattingRequest, DocumentOnTypeFormattingRequest, RenameRequest, DocumentLinkRequest, ProgressType, ProgressToken, StaticRegistrationOptions, DocumentColorRequest, DeclarationRequest, FoldingRangeRequest, ImplementationRequest, SelectionRangeRequest, TypeDefinitionRequest, CallHierarchyPrepareRequest, CancellationStrategy, RegistrationType, SemanticTokensRegistrationType, ShowDocumentRequest, FileOperationRegistrationOptions, WillCreateFilesRequest, WillRenameFilesRequest, WillDeleteFilesRequest, DidCreateFilesNotification, DidDeleteFilesNotification, DidRenameFilesNotification, ShowDocumentParams, ShowDocumentResult, LinkedEditingRangeRequest, WorkDoneProgressBegin, WorkDoneProgressEnd, WorkDoneProgressReport } from 'vscode-languageserver-protocol';
import type { ColorProviderMiddleware } from './colorProvider';
import type { ImplementationMiddleware } from './implementation';
import type { TypeDefinitionMiddleware } from './typeDefinition';
import { ConfigurationWorkspaceMiddleware } from './configuration';
import type { WorkspaceFolderWorkspaceMiddleware } from './workspaceFolders';
import type { FoldingRangeProviderMiddleware } from './foldingRange';
import type { DeclarationMiddleware } from './declaration';
import type { SelectionRangeProviderMiddleware } from './selectionRange';
import type { CallHierarchyMiddleware } from './callHierarchy';
import type { SemanticTokensMiddleware, SemanticTokensProviders } from './semanticTokens';
import type { FileOperationsMiddleware } from './fileOperations';
import { LinkedEditingRangeMiddleware } from './linkedEditingRange';
import * as c2p from './codeConverter';
import * as p2c from './protocolConverter';
interface ConnectionOptions {
    cancellationStrategy: CancellationStrategy;
    maxRestartCount?: number;
}
/**
 * An action to be performed when the connection is producing errors.
 */
export declare enum ErrorAction {
    /**
     * Continue running the server.
     */
    Continue = 1,
    /**
     * Shutdown the server.
     */
    Shutdown = 2
}
/**
 * An action to be performed when the connection to a server got closed.
 */
export declare enum CloseAction {
    /**
     * Don't restart the server. The connection stays closed.
     */
    DoNotRestart = 1,
    /**
     * Restart the server.
     */
    Restart = 2
}
/**
 * A plugable error handler that is invoked when the connection is either
 * producing errors or got closed.
 */
export interface ErrorHandler {
    /**
     * An error has occurred while writing or reading from the connection.
     *
     * @param error - the error received
     * @param message - the message to be delivered to the server if know.
     * @param count - a count indicating how often an error is received. Will
     *  be reset if a message got successfully send or received.
     */
    error(error: Error, message: Message | undefined, count: number | undefined): ErrorAction;
    /**
     * The connection to the server got closed.
     */
    closed(): CloseAction;
}
/**
 * A handler that is invoked when the initialization of the server failed.
 */
export interface InitializationFailedHandler {
    /**
     * @param error The error returned from the server
     * @returns if true is returned the client tries to reinitialize the server.
     *  Implementors of a handler are responsible to not initialize the server
     *  infinitely. Return false if initialization should stop and an error
     *  should be reported.
     */
    (error: ResponseError<InitializeError> | Error | any): boolean;
}
export interface SynchronizeOptions {
    /**
     * The configuration sections to synchronize. Pushing settings from the
     * client to the server is deprecated in favour of the new pull model
     * that allows servers to query settings scoped on resources. In this
     * model the client can only deliver an empty change event since the
     * actually setting value can vary on the provided resource scope.
     *
     * @deprecated Use the new pull model (`workspace/configuration` request)
     */
    configurationSection?: string | string[];
    /**
     * Asks the client to send file change events to the server. Watchers
     * operate on workspace folders. The LSP client doesn't support watching
     * files outside a workspace folder.
     */
    fileEvents?: VFileSystemWatcher | VFileSystemWatcher[];
}
export declare enum RevealOutputChannelOn {
    Info = 1,
    Warn = 2,
    Error = 3,
    Never = 4
}
export interface HandleDiagnosticsSignature {
    (this: void, uri: Uri, diagnostics: VDiagnostic[]): void;
}
export interface HandleWorkDoneProgressSignature {
    (this: void, token: ProgressToken, params: WorkDoneProgressBegin | WorkDoneProgressReport | WorkDoneProgressEnd): void;
}
export interface ProvideCompletionItemsSignature {
    (this: void, document: TextDocument, position: VPosition, context: VCompletionContext, token: CancellationToken): ProviderResult<VCompletionItem[] | VCompletionList>;
}
export interface ResolveCompletionItemSignature {
    (this: void, item: VCompletionItem, token: CancellationToken): ProviderResult<VCompletionItem>;
}
export interface ProvideHoverSignature {
    (this: void, document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VHover>;
}
export interface ProvideSignatureHelpSignature {
    (this: void, document: TextDocument, position: VPosition, context: VSignatureHelpContext, token: CancellationToken): ProviderResult<VSignatureHelp>;
}
export interface ProvideDefinitionSignature {
    (this: void, document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VDefinition | VDefinitionLink[]>;
}
export interface ProvideReferencesSignature {
    (this: void, document: TextDocument, position: VPosition, options: {
        includeDeclaration: boolean;
    }, token: CancellationToken): ProviderResult<VLocation[]>;
}
export interface ProvideDocumentHighlightsSignature {
    (this: void, document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VDocumentHighlight[]>;
}
export interface ProvideDocumentSymbolsSignature {
    (this: void, document: TextDocument, token: CancellationToken): ProviderResult<VSymbolInformation[] | VDocumentSymbol[]>;
}
export interface ProvideWorkspaceSymbolsSignature {
    (this: void, query: string, token: CancellationToken): ProviderResult<VSymbolInformation[]>;
}
export interface ProvideCodeActionsSignature {
    (this: void, document: TextDocument, range: VRange, context: VCodeActionContext, token: CancellationToken): ProviderResult<(VCommand | VCodeAction)[]>;
}
export interface ResolveCodeActionSignature {
    (this: void, item: VCodeAction, token: CancellationToken): ProviderResult<VCodeAction>;
}
export interface ProvideCodeLensesSignature {
    (this: void, document: TextDocument, token: CancellationToken): ProviderResult<VCodeLens[]>;
}
export interface ResolveCodeLensSignature {
    (this: void, codeLens: VCodeLens, token: CancellationToken): ProviderResult<VCodeLens>;
}
export interface ProvideDocumentFormattingEditsSignature {
    (this: void, document: TextDocument, options: VFormattingOptions, token: CancellationToken): ProviderResult<VTextEdit[]>;
}
export interface ProvideDocumentRangeFormattingEditsSignature {
    (this: void, document: TextDocument, range: VRange, options: VFormattingOptions, token: CancellationToken): ProviderResult<VTextEdit[]>;
}
export interface ProvideOnTypeFormattingEditsSignature {
    (this: void, document: TextDocument, position: VPosition, ch: string, options: VFormattingOptions, token: CancellationToken): ProviderResult<VTextEdit[]>;
}
export interface ProvideRenameEditsSignature {
    (this: void, document: TextDocument, position: VPosition, newName: string, token: CancellationToken): ProviderResult<VWorkspaceEdit>;
}
export interface PrepareRenameSignature {
    (this: void, document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VRange | {
        range: VRange;
        placeholder: string;
    }>;
}
export interface ProvideDocumentLinksSignature {
    (this: void, document: TextDocument, token: CancellationToken): ProviderResult<VDocumentLink[]>;
}
export interface ResolveDocumentLinkSignature {
    (this: void, link: VDocumentLink, token: CancellationToken): ProviderResult<VDocumentLink>;
}
export interface ExecuteCommandSignature {
    (this: void, command: string, args: any[]): ProviderResult<any>;
}
export interface NextSignature<P, R> {
    (this: void, data: P, next: (data: P) => R): R;
}
export interface DidChangeConfigurationSignature {
    (this: void, sections: string[] | undefined): void;
}
export interface DidChangeWatchedFileSignature {
    (this: void, event: FileEvent): void;
}
export interface _WorkspaceMiddleware {
    didChangeConfiguration?: (this: void, sections: string[] | undefined, next: DidChangeConfigurationSignature) => void;
    didChangeWatchedFile?: (this: void, event: FileEvent, next: DidChangeWatchedFileSignature) => void;
}
export declare type WorkspaceMiddleware = _WorkspaceMiddleware & ConfigurationWorkspaceMiddleware & WorkspaceFolderWorkspaceMiddleware & FileOperationsMiddleware;
export interface _WindowMiddleware {
    showDocument?: (this: void, params: ShowDocumentParams, next: ShowDocumentRequest.HandlerSignature) => Promise<ShowDocumentResult>;
}
export declare type WindowMiddleware = _WindowMiddleware;
/**
 * The Middleware lets extensions intercept the request and notifications send and received
 * from the server
 */
export interface _Middleware {
    didOpen?: NextSignature<TextDocument, void>;
    didChange?: NextSignature<TextDocumentChangeEvent, void>;
    willSave?: NextSignature<TextDocumentWillSaveEvent, void>;
    willSaveWaitUntil?: NextSignature<TextDocumentWillSaveEvent, Thenable<VTextEdit[]>>;
    didSave?: NextSignature<TextDocument, void>;
    didClose?: NextSignature<TextDocument, void>;
    handleDiagnostics?: (this: void, uri: Uri, diagnostics: VDiagnostic[], next: HandleDiagnosticsSignature) => void;
    handleWorkDoneProgress?: (this: void, token: ProgressToken, params: WorkDoneProgressBegin | WorkDoneProgressReport | WorkDoneProgressEnd, next: HandleWorkDoneProgressSignature) => void;
    provideCompletionItem?: (this: void, document: TextDocument, position: VPosition, context: VCompletionContext, token: CancellationToken, next: ProvideCompletionItemsSignature) => ProviderResult<VCompletionItem[] | VCompletionList>;
    resolveCompletionItem?: (this: void, item: VCompletionItem, token: CancellationToken, next: ResolveCompletionItemSignature) => ProviderResult<VCompletionItem>;
    provideHover?: (this: void, document: TextDocument, position: VPosition, token: CancellationToken, next: ProvideHoverSignature) => ProviderResult<VHover>;
    provideSignatureHelp?: (this: void, document: TextDocument, position: VPosition, context: VSignatureHelpContext, token: CancellationToken, next: ProvideSignatureHelpSignature) => ProviderResult<VSignatureHelp>;
    provideDefinition?: (this: void, document: TextDocument, position: VPosition, token: CancellationToken, next: ProvideDefinitionSignature) => ProviderResult<VDefinition | VDefinitionLink[]>;
    provideReferences?: (this: void, document: TextDocument, position: VPosition, options: {
        includeDeclaration: boolean;
    }, token: CancellationToken, next: ProvideReferencesSignature) => ProviderResult<VLocation[]>;
    provideDocumentHighlights?: (this: void, document: TextDocument, position: VPosition, token: CancellationToken, next: ProvideDocumentHighlightsSignature) => ProviderResult<VDocumentHighlight[]>;
    provideDocumentSymbols?: (this: void, document: TextDocument, token: CancellationToken, next: ProvideDocumentSymbolsSignature) => ProviderResult<VSymbolInformation[] | VDocumentSymbol[]>;
    provideWorkspaceSymbols?: (this: void, query: string, token: CancellationToken, next: ProvideWorkspaceSymbolsSignature) => ProviderResult<VSymbolInformation[]>;
    provideCodeActions?: (this: void, document: TextDocument, range: VRange, context: VCodeActionContext, token: CancellationToken, next: ProvideCodeActionsSignature) => ProviderResult<(VCommand | VCodeAction)[]>;
    resolveCodeAction?: (this: void, item: VCodeAction, token: CancellationToken, next: ResolveCodeActionSignature) => ProviderResult<VCodeAction>;
    provideCodeLenses?: (this: void, document: TextDocument, token: CancellationToken, next: ProvideCodeLensesSignature) => ProviderResult<VCodeLens[]>;
    resolveCodeLens?: (this: void, codeLens: VCodeLens, token: CancellationToken, next: ResolveCodeLensSignature) => ProviderResult<VCodeLens>;
    provideDocumentFormattingEdits?: (this: void, document: TextDocument, options: VFormattingOptions, token: CancellationToken, next: ProvideDocumentFormattingEditsSignature) => ProviderResult<VTextEdit[]>;
    provideDocumentRangeFormattingEdits?: (this: void, document: TextDocument, range: VRange, options: VFormattingOptions, token: CancellationToken, next: ProvideDocumentRangeFormattingEditsSignature) => ProviderResult<VTextEdit[]>;
    provideOnTypeFormattingEdits?: (this: void, document: TextDocument, position: VPosition, ch: string, options: VFormattingOptions, token: CancellationToken, next: ProvideOnTypeFormattingEditsSignature) => ProviderResult<VTextEdit[]>;
    provideRenameEdits?: (this: void, document: TextDocument, position: VPosition, newName: string, token: CancellationToken, next: ProvideRenameEditsSignature) => ProviderResult<VWorkspaceEdit>;
    prepareRename?: (this: void, document: TextDocument, position: VPosition, token: CancellationToken, next: PrepareRenameSignature) => ProviderResult<VRange | {
        range: VRange;
        placeholder: string;
    }>;
    provideDocumentLinks?: (this: void, document: TextDocument, token: CancellationToken, next: ProvideDocumentLinksSignature) => ProviderResult<VDocumentLink[]>;
    resolveDocumentLink?: (this: void, link: VDocumentLink, token: CancellationToken, next: ResolveDocumentLinkSignature) => ProviderResult<VDocumentLink>;
    executeCommand?: (this: void, command: string, args: any[], next: ExecuteCommandSignature) => ProviderResult<any>;
    workspace?: WorkspaceMiddleware;
    window?: WindowMiddleware;
}
export declare type Middleware = _Middleware & TypeDefinitionMiddleware & ImplementationMiddleware & ColorProviderMiddleware & FoldingRangeProviderMiddleware & DeclarationMiddleware & SelectionRangeProviderMiddleware & CallHierarchyMiddleware & SemanticTokensMiddleware & LinkedEditingRangeMiddleware;
export interface LanguageClientOptions {
    documentSelector?: DocumentSelector | string[];
    synchronize?: SynchronizeOptions;
    diagnosticCollectionName?: string;
    outputChannel?: OutputChannel;
    outputChannelName?: string;
    traceOutputChannel?: OutputChannel;
    revealOutputChannelOn?: RevealOutputChannelOn;
    /**
     * The encoding use to read stdout and stderr. Defaults
     * to 'utf8' if omitted.
     */
    stdioEncoding?: string;
    initializationOptions?: any | (() => any);
    initializationFailedHandler?: InitializationFailedHandler;
    progressOnInitialization?: boolean;
    errorHandler?: ErrorHandler;
    middleware?: Middleware;
    uriConverters?: {
        code2Protocol: c2p.URIConverter;
        protocol2Code: p2c.URIConverter;
    };
    workspaceFolder?: VWorkspaceFolder;
    connectionOptions?: ConnectionOptions;
    markdown?: {
        isTrusted?: boolean;
    };
}
export declare enum State {
    Stopped = 1,
    Starting = 3,
    Running = 2
}
export interface StateChangeEvent {
    oldState: State;
    newState: State;
}
export interface RegistrationData<T> {
    id: string;
    registerOptions: T;
}
/**
 * A static feature. A static feature can't be dynamically activate via the
 * server. It is wired during the initialize sequence.
 */
export interface StaticFeature {
    /**
     * Called to fill the initialize params.
     *
     * @params the initialize params.
     */
    fillInitializeParams?: (params: InitializeParams) => void;
    /**
     * Called to fill in the client capabilities this feature implements.
     *
     * @param capabilities The client capabilities to fill.
     */
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    /**
     * Initialize the feature. This method is called on a feature instance
     * when the client has successfully received the initialize request from
     * the server and before the client sends the initialized notification
     * to the server.
     *
     * @param capabilities the server capabilities
     * @param documentSelector the document selector pass to the client's constructor.
     *  May be `undefined` if the client was created without a selector.
     */
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void;
    /**
     * Called when the client is stopped to dispose this feature. Usually a feature
     * un-registers listeners registered hooked up with the VS Code extension host.
     */
    dispose(): void;
}
export interface DynamicFeature<RO> {
    /**
     * Called to fill the initialize params.
     *
     * @params the initialize params.
     */
    fillInitializeParams?: (params: InitializeParams) => void;
    /**
     * Called to fill in the client capabilities this feature implements.
     *
     * @param capabilities The client capabilities to fill.
     */
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    /**
     * Initialize the feature. This method is called on a feature instance
     * when the client has successfully received the initialize request from
     * the server and before the client sends the initialized notification
     * to the server.
     *
     * @param capabilities the server capabilities.
     * @param documentSelector the document selector pass to the client's constructor.
     *  May be `undefined` if the client was created without a selector.
     */
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void;
    /**
     * The signature (e.g. method) for which this features support dynamic activation / registration.
     */
    registrationType: RegistrationType<RO>;
    /**
     * Is called when the server send a register request for the given message.
     *
     * @param data additional registration data as defined in the protocol.
     */
    register(data: RegistrationData<RO>): void;
    /**
     * Is called when the server wants to unregister a feature.
     *
     * @param id the id used when registering the feature.
     */
    unregister(id: string): void;
    /**
     * Called when the client is stopped to dispose this feature. Usually a feature
     * un-registers listeners registered hooked up with the VS Code extension host.
     */
    dispose(): void;
}
export interface NotificationFeature<T extends Function> {
    /**
     * Triggers the corresponding RPC method.
     */
    getProvider(document: TextDocument): {
        send: T;
    } | undefined;
}
export interface TextDocumentProviderFeature<T> {
    /**
     * Triggers the corresponding RPC method.
     */
    getProvider(textDocument: TextDocument): T | undefined;
}
export declare abstract class TextDocumentFeature<PO, RO extends TextDocumentRegistrationOptions & PO, PR> implements DynamicFeature<RO> {
    protected _client: BaseLanguageClient;
    private _registrationType;
    private _registrations;
    constructor(_client: BaseLanguageClient, _registrationType: RegistrationType<RO>);
    get registrationType(): RegistrationType<RO>;
    abstract fillClientCapabilities(capabilities: ClientCapabilities): void;
    abstract initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    register(data: RegistrationData<RO>): void;
    protected abstract registerLanguageProvider(options: RO): [Disposable, PR];
    unregister(id: string): void;
    dispose(): void;
    protected getRegistration(documentSelector: DocumentSelector | undefined, capability: undefined | PO | (RO & StaticRegistrationOptions)): [string | undefined, (RO & {
        documentSelector: DocumentSelector;
    }) | undefined];
    protected getRegistrationOptions(documentSelector: DocumentSelector | undefined, capability: undefined | PO): (RO & {
        documentSelector: DocumentSelector;
    }) | undefined;
    getProvider(textDocument: TextDocument): PR | undefined;
    protected getAllProviders(): Iterable<PR>;
}
export interface WorkspaceProviderFeature<PR> {
    getProviders(): PR[] | undefined;
}
export interface ProvideResolveFeature<T1 extends Function, T2 extends Function> {
    provide: T1;
    resolve: T2;
}
declare module 'vscode' {
    interface CodeActionProvider<T extends CodeAction = CodeAction> {
        resolveCodeAction?(codeAction: T, token: CancellationToken): ProviderResult<T>;
    }
}
export interface MessageTransports {
    reader: MessageReader;
    writer: MessageWriter;
    detached?: boolean;
}
export declare namespace MessageTransports {
    function is(value: any): value is MessageTransports;
}
export declare abstract class BaseLanguageClient {
    private _id;
    private _name;
    private _clientOptions;
    private _state;
    private _onReady;
    private _onReadyCallbacks;
    private _onStop;
    private _connectionPromise;
    private _resolvedConnection;
    private _initializeResult;
    private _outputChannel;
    private _disposeOutputChannel;
    private _traceOutputChannel;
    private _capabilities;
    private _listeners;
    private _providers;
    private _diagnostics;
    private _syncedDocuments;
    private _fileEvents;
    private _fileEventDelayer;
    private _telemetryEmitter;
    private _stateChangeEmitter;
    private _trace;
    private _traceFormat;
    private _tracer;
    private _c2p;
    private _p2c;
    constructor(id: string, name: string, clientOptions: LanguageClientOptions);
    private get state();
    private set state(value);
    private getPublicState;
    get initializeResult(): InitializeResult | undefined;
    sendRequest<R, PR, E, RO>(type: ProtocolRequestType0<R, PR, E, RO>, token?: CancellationToken): Promise<R>;
    sendRequest<P, R, PR, E, RO>(type: ProtocolRequestType<P, R, PR, E, RO>, params: P, token?: CancellationToken): Promise<R>;
    sendRequest<R, E>(type: RequestType0<R, E>, token?: CancellationToken): Promise<R>;
    sendRequest<P, R, E>(type: RequestType<P, R, E>, params: P, token?: CancellationToken): Promise<R>;
    sendRequest<R>(method: string, token?: CancellationToken): Promise<R>;
    sendRequest<R>(method: string, param: any, token?: CancellationToken): Promise<R>;
    onRequest<R, PR, E, RO>(type: ProtocolRequestType0<R, PR, E, RO>, handler: RequestHandler0<R, E>): Disposable;
    onRequest<P, R, PR, E, RO>(type: ProtocolRequestType<P, R, PR, E, RO>, handler: RequestHandler<P, R, E>): Disposable;
    onRequest<R, E>(type: RequestType0<R, E>, handler: RequestHandler0<R, E>): Disposable;
    onRequest<P, R, E>(type: RequestType<P, R, E>, handler: RequestHandler<P, R, E>): Disposable;
    onRequest<R, E>(method: string, handler: GenericRequestHandler<R, E>): Disposable;
    sendNotification<RO>(type: ProtocolNotificationType0<RO>): void;
    sendNotification<P, RO>(type: ProtocolNotificationType<P, RO>, params?: P): void;
    sendNotification(type: NotificationType0): void;
    sendNotification<P>(type: NotificationType<P>, params?: P): void;
    sendNotification(method: string): void;
    sendNotification(method: string, params: any): void;
    onNotification<RO>(type: ProtocolNotificationType0<RO>, handler: NotificationHandler0): Disposable;
    onNotification<P, RO>(type: ProtocolNotificationType<P, RO>, handler: NotificationHandler<P>): Disposable;
    onNotification(type: NotificationType0, handler: NotificationHandler0): Disposable;
    onNotification<P>(type: NotificationType<P>, handler: NotificationHandler<P>): Disposable;
    onNotification(method: string, handler: GenericNotificationHandler): Disposable;
    onProgress<P>(type: ProgressType<P>, token: string | number, handler: NotificationHandler<P>): Disposable;
    sendProgress<P>(type: ProgressType<P>, token: string | number, value: P): void;
    get clientOptions(): LanguageClientOptions;
    get protocol2CodeConverter(): p2c.Converter;
    get code2ProtocolConverter(): c2p.Converter;
    get onTelemetry(): Event<any>;
    get onDidChangeState(): Event<StateChangeEvent>;
    get outputChannel(): OutputChannel;
    get traceOutputChannel(): OutputChannel;
    get diagnostics(): DiagnosticCollection | undefined;
    createDefaultErrorHandler(maxRestartCount?: number): ErrorHandler;
    set trace(value: Trace);
    private data2String;
    info(message: string, data?: any, showNotification?: boolean): void;
    warn(message: string, data?: any, showNotification?: boolean): void;
    error(message: string, data?: any, showNotification?: boolean): void;
    private showNotificationMessage;
    private logTrace;
    private logObjectTrace;
    needsStart(): boolean;
    needsStop(): boolean;
    onReady(): Promise<void>;
    private isConnectionActive;
    start(): Disposable;
    private resolveConnection;
    private initialize;
    private doInitialize;
    private _clientGetRootPath;
    stop(): Promise<void>;
    private cleanUp;
    private cleanUpChannel;
    private notifyFileEvent;
    private _didChangeTextDocumentFeature;
    private forceDocumentSync;
    private handleDiagnostics;
    private setDiagnostics;
    protected abstract getLocale(): string;
    protected abstract createMessageTransports(encoding: string): Promise<MessageTransports>;
    private createConnection;
    protected handleConnectionClosed(): void;
    private handleConnectionError;
    private hookConfigurationChanged;
    private refreshTrace;
    private hookFileEvents;
    private readonly _features;
    private readonly _dynamicFeatures;
    registerFeatures(features: (StaticFeature | DynamicFeature<any>)[]): void;
    registerFeature(feature: StaticFeature | DynamicFeature<any>): void;
    getFeature(request: typeof DidOpenTextDocumentNotification.method): DynamicFeature<TextDocumentRegistrationOptions> & NotificationFeature<(textDocument: TextDocument) => void>;
    getFeature(request: typeof DidChangeTextDocumentNotification.method): DynamicFeature<TextDocumentRegistrationOptions> & NotificationFeature<(textDocument: TextDocument) => void>;
    getFeature(request: typeof WillSaveTextDocumentNotification.method): DynamicFeature<TextDocumentRegistrationOptions> & NotificationFeature<(textDocument: TextDocument) => void>;
    getFeature(request: typeof WillSaveTextDocumentWaitUntilRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & NotificationFeature<(textDocument: TextDocument) => ProviderResult<VTextEdit[]>>;
    getFeature(request: typeof DidSaveTextDocumentNotification.method): DynamicFeature<TextDocumentRegistrationOptions> & NotificationFeature<(textDocument: TextDocument) => void>;
    getFeature(request: typeof DidCloseTextDocumentNotification.method): DynamicFeature<TextDocumentRegistrationOptions> & NotificationFeature<(textDocument: TextDocument) => void>;
    getFeature(request: typeof DidCreateFilesNotification.method): DynamicFeature<FileOperationRegistrationOptions> & {
        send: (event: FileCreateEvent) => Promise<void>;
    };
    getFeature(request: typeof DidRenameFilesNotification.method): DynamicFeature<FileOperationRegistrationOptions> & {
        send: (event: FileRenameEvent) => Promise<void>;
    };
    getFeature(request: typeof DidDeleteFilesNotification.method): DynamicFeature<FileOperationRegistrationOptions> & {
        send: (event: FileDeleteEvent) => Promise<void>;
    };
    getFeature(request: typeof WillCreateFilesRequest.method): DynamicFeature<FileOperationRegistrationOptions> & {
        send: (event: FileWillCreateEvent) => Promise<void>;
    };
    getFeature(request: typeof WillRenameFilesRequest.method): DynamicFeature<FileOperationRegistrationOptions> & {
        send: (event: FileWillRenameEvent) => Promise<void>;
    };
    getFeature(request: typeof WillDeleteFilesRequest.method): DynamicFeature<FileOperationRegistrationOptions> & {
        send: (event: FileWillDeleteEvent) => Promise<void>;
    };
    getFeature(request: typeof CompletionRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<CompletionItemProvider>;
    getFeature(request: typeof HoverRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<HoverProvider>;
    getFeature(request: typeof SignatureHelpRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<SignatureHelpProvider>;
    getFeature(request: typeof DefinitionRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DefinitionProvider>;
    getFeature(request: typeof ReferencesRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<ReferenceProvider>;
    getFeature(request: typeof DocumentHighlightRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DocumentHighlightProvider>;
    getFeature(request: typeof CodeActionRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<CodeActionProvider>;
    getFeature(request: typeof DocumentFormattingRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DocumentFormattingEditProvider>;
    getFeature(request: typeof DocumentRangeFormattingRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DocumentRangeFormattingEditProvider>;
    getFeature(request: typeof DocumentOnTypeFormattingRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<OnTypeFormattingEditProvider>;
    getFeature(request: typeof RenameRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<RenameProvider>;
    getFeature(request: typeof DocumentSymbolRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DocumentSymbolProvider>;
    getFeature(request: typeof DocumentLinkRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DocumentLinkProvider>;
    getFeature(request: typeof DocumentColorRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DocumentColorProvider>;
    getFeature(request: typeof DeclarationRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<DeclarationProvider>;
    getFeature(request: typeof FoldingRangeRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<FoldingRangeProvider>;
    getFeature(request: typeof ImplementationRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<ImplementationProvider>;
    getFeature(request: typeof SelectionRangeRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<SelectionRangeProvider>;
    getFeature(request: typeof TypeDefinitionRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<TypeDefinitionProvider>;
    getFeature(request: typeof CallHierarchyPrepareRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<CallHierarchyProvider>;
    getFeature(request: typeof SemanticTokensRegistrationType.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<SemanticTokensProviders>;
    getFeature(request: typeof LinkedEditingRangeRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & TextDocumentProviderFeature<LinkedEditingRangeProvider>;
    getFeature(request: typeof WorkspaceSymbolRequest.method): DynamicFeature<TextDocumentRegistrationOptions> & WorkspaceProviderFeature<WorkspaceSymbolProvider>;
    protected registerBuiltinFeatures(): void;
    protected fillInitializeParams(params: InitializeParams): void;
    private computeClientCapabilities;
    private initializeFeatures;
    private handleRegistrationRequest;
    private handleUnregistrationRequest;
    private handleApplyWorkspaceEdit;
    handleFailedRequest<T>(type: MessageSignature, error: any, defaultValue: T): T;
    private static Canceled;
    private makeCancelError;
}
export {};

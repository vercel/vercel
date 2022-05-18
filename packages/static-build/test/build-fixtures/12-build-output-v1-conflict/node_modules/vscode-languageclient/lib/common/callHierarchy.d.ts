import { Disposable, TextDocument, ProviderResult, Position as VPosition, CallHierarchyItem as VCallHierarchyItem, CallHierarchyIncomingCall as VCallHierarchyIncomingCall, CallHierarchyOutgoingCall as VCallHierarchyOutgoingCall, CancellationToken, CallHierarchyProvider as VCallHierarchyProvider } from 'vscode';
import { ClientCapabilities, ServerCapabilities, DocumentSelector, CallHierarchyOptions, CallHierarchyRegistrationOptions } from 'vscode-languageserver-protocol';
import { TextDocumentFeature, BaseLanguageClient } from './client';
export interface PrepareCallHierarchySignature {
    (this: void, document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VCallHierarchyItem | VCallHierarchyItem[]>;
}
export interface CallHierarchyIncomingCallsSignature {
    (this: void, item: VCallHierarchyItem, token: CancellationToken): ProviderResult<VCallHierarchyIncomingCall[]>;
}
export interface CallHierarchyOutgoingCallsSignature {
    (this: void, item: VCallHierarchyItem, token: CancellationToken): ProviderResult<VCallHierarchyOutgoingCall[]>;
}
/**
 * Call hierarchy middleware
 *
 * @since 3.16.0
 */
export interface CallHierarchyMiddleware {
    prepareCallHierarchy?: (this: void, document: TextDocument, positions: VPosition, token: CancellationToken, next: PrepareCallHierarchySignature) => ProviderResult<VCallHierarchyItem | VCallHierarchyItem[]>;
    provideCallHierarchyIncomingCalls?: (this: void, item: VCallHierarchyItem, token: CancellationToken, next: CallHierarchyIncomingCallsSignature) => ProviderResult<VCallHierarchyIncomingCall[]>;
    provideCallHierarchyOutgoingCalls?: (this: void, item: VCallHierarchyItem, token: CancellationToken, next: CallHierarchyOutgoingCallsSignature) => ProviderResult<VCallHierarchyOutgoingCall[]>;
}
declare class CallHierarchyProvider implements VCallHierarchyProvider {
    private client;
    private middleware;
    constructor(client: BaseLanguageClient);
    prepareCallHierarchy(document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VCallHierarchyItem | VCallHierarchyItem[]>;
    provideCallHierarchyIncomingCalls(item: VCallHierarchyItem, token: CancellationToken): ProviderResult<VCallHierarchyIncomingCall[]>;
    provideCallHierarchyOutgoingCalls(item: VCallHierarchyItem, token: CancellationToken): ProviderResult<VCallHierarchyOutgoingCall[]>;
}
export declare class CallHierarchyFeature extends TextDocumentFeature<boolean | CallHierarchyOptions, CallHierarchyRegistrationOptions, CallHierarchyProvider> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(cap: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    protected registerLanguageProvider(options: CallHierarchyRegistrationOptions): [Disposable, CallHierarchyProvider];
}
export {};

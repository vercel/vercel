import { Disposable, TextDocument, ProviderResult, FoldingRange as VFoldingRange, FoldingContext, FoldingRangeProvider } from 'vscode';
import { ClientCapabilities, CancellationToken, ServerCapabilities, DocumentSelector, FoldingRangeRegistrationOptions, FoldingRangeOptions } from 'vscode-languageserver-protocol';
import { TextDocumentFeature, BaseLanguageClient } from './client';
export interface ProvideFoldingRangeSignature {
    (this: void, document: TextDocument, context: FoldingContext, token: CancellationToken): ProviderResult<VFoldingRange[]>;
}
export interface FoldingRangeProviderMiddleware {
    provideFoldingRanges?: (this: void, document: TextDocument, context: FoldingContext, token: CancellationToken, next: ProvideFoldingRangeSignature) => ProviderResult<VFoldingRange[]>;
}
export declare class FoldingRangeFeature extends TextDocumentFeature<boolean | FoldingRangeOptions, FoldingRangeRegistrationOptions, FoldingRangeProvider> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    protected registerLanguageProvider(options: FoldingRangeRegistrationOptions): [Disposable, FoldingRangeProvider];
    private static asFoldingRangeKind;
    private static asFoldingRanges;
}

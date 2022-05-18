import { Disposable, TextDocument, ProviderResult, Position as VPosition, SelectionRange as VSelectionRange, SelectionRangeProvider } from 'vscode';
import { ClientCapabilities, CancellationToken, ServerCapabilities, DocumentSelector, SelectionRangeOptions, SelectionRangeRegistrationOptions } from 'vscode-languageserver-protocol';
import { TextDocumentFeature, BaseLanguageClient } from './client';
export interface ProvideSelectionRangeSignature {
    (this: void, document: TextDocument, positions: VPosition[], token: CancellationToken): ProviderResult<VSelectionRange[]>;
}
export interface SelectionRangeProviderMiddleware {
    provideSelectionRanges?: (this: void, document: TextDocument, positions: VPosition[], token: CancellationToken, next: ProvideSelectionRangeSignature) => ProviderResult<VSelectionRange[]>;
}
export declare class SelectionRangeFeature extends TextDocumentFeature<boolean | SelectionRangeOptions, SelectionRangeRegistrationOptions, SelectionRangeProvider> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    protected registerLanguageProvider(options: SelectionRangeRegistrationOptions): [Disposable, SelectionRangeProvider];
}

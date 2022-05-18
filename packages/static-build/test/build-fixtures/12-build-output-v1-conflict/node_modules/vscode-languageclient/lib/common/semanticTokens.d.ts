import * as vscode from 'vscode';
import { BaseLanguageClient, TextDocumentFeature } from './client';
import { ClientCapabilities, ServerCapabilities, DocumentSelector, SemanticTokensOptions, SemanticTokensRegistrationOptions } from 'vscode-languageserver-protocol';
export interface DocumentSemanticsTokensSignature {
    (this: void, document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SemanticTokens>;
}
export interface DocumentSemanticsTokensEditsSignature {
    (this: void, document: vscode.TextDocument, previousResultId: string, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SemanticTokensEdits | vscode.SemanticTokens>;
}
export interface DocumentRangeSemanticTokensSignature {
    (this: void, document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SemanticTokens>;
}
/**
 * The semantic token middleware
 *
 * @since 3.16.0
 */
export interface SemanticTokensMiddleware {
    provideDocumentSemanticTokens?: (this: void, document: vscode.TextDocument, token: vscode.CancellationToken, next: DocumentSemanticsTokensSignature) => vscode.ProviderResult<vscode.SemanticTokens>;
    provideDocumentSemanticTokensEdits?: (this: void, document: vscode.TextDocument, previousResultId: string, token: vscode.CancellationToken, next: DocumentSemanticsTokensEditsSignature) => vscode.ProviderResult<vscode.SemanticTokensEdits | vscode.SemanticTokens>;
    provideDocumentRangeSemanticTokens?: (this: void, document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken, next: DocumentRangeSemanticTokensSignature) => vscode.ProviderResult<vscode.SemanticTokens>;
}
export interface SemanticTokensProviders {
    range?: vscode.DocumentRangeSemanticTokensProvider;
    full?: vscode.DocumentSemanticTokensProvider;
    onDidChangeSemanticTokensEmitter: vscode.EventEmitter<void>;
}
export declare class SemanticTokensFeature extends TextDocumentFeature<boolean | SemanticTokensOptions, SemanticTokensRegistrationOptions, SemanticTokensProviders> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    protected registerLanguageProvider(options: SemanticTokensRegistrationOptions): [vscode.Disposable, SemanticTokensProviders];
}

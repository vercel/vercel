import { Disposable, TextDocument, ProviderResult, Position as VPosition, Declaration as VDeclaration, DeclarationProvider } from 'vscode';
import { ClientCapabilities, CancellationToken, ServerCapabilities, DocumentSelector, DeclarationRegistrationOptions, DeclarationOptions } from 'vscode-languageserver-protocol';
import { TextDocumentFeature, BaseLanguageClient } from './client';
export interface ProvideDeclarationSignature {
    (this: void, document: TextDocument, position: VPosition, token: CancellationToken): ProviderResult<VDeclaration>;
}
export interface DeclarationMiddleware {
    provideDeclaration?: (this: void, document: TextDocument, position: VPosition, token: CancellationToken, next: ProvideDeclarationSignature) => ProviderResult<VDeclaration>;
}
export declare class DeclarationFeature extends TextDocumentFeature<boolean | DeclarationOptions, DeclarationRegistrationOptions, DeclarationProvider> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    protected registerLanguageProvider(options: DeclarationRegistrationOptions): [Disposable, DeclarationProvider];
}

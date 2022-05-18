import { Disposable, TextDocument, ProviderResult, Range as VRange, Color as VColor, ColorPresentation as VColorPresentation, ColorInformation as VColorInformation, DocumentColorProvider } from 'vscode';
import { ClientCapabilities, CancellationToken, ServerCapabilities, DocumentSelector, DocumentColorRegistrationOptions, DocumentColorOptions } from 'vscode-languageserver-protocol';
import { TextDocumentFeature, BaseLanguageClient } from './client';
export interface ProvideDocumentColorsSignature {
    (document: TextDocument, token: CancellationToken): ProviderResult<VColorInformation[]>;
}
export interface ProvideColorPresentationSignature {
    (color: VColor, context: {
        document: TextDocument;
        range: VRange;
    }, token: CancellationToken): ProviderResult<VColorPresentation[]>;
}
export interface ColorProviderMiddleware {
    provideDocumentColors?: (this: void, document: TextDocument, token: CancellationToken, next: ProvideDocumentColorsSignature) => ProviderResult<VColorInformation[]>;
    provideColorPresentations?: (this: void, color: VColor, context: {
        document: TextDocument;
        range: VRange;
    }, token: CancellationToken, next: ProvideColorPresentationSignature) => ProviderResult<VColorPresentation[]>;
}
export declare class ColorProviderFeature extends TextDocumentFeature<boolean | DocumentColorOptions, DocumentColorRegistrationOptions, DocumentColorProvider> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(capabilities: ClientCapabilities): void;
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void;
    protected registerLanguageProvider(options: DocumentColorRegistrationOptions): [Disposable, DocumentColorProvider];
    private asColor;
    private asColorInformations;
    private asColorPresentations;
}

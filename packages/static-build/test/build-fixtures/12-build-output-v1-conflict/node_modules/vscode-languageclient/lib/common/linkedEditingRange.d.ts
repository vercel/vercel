/// <reference path="../../typings/vscode-proposed.d.ts" />
import * as code from 'vscode';
import * as proto from 'vscode-languageserver-protocol';
import { TextDocumentFeature, BaseLanguageClient } from './client';
export interface ProvideLinkedEditingRangeSignature {
    (this: void, document: code.TextDocument, position: code.Position, token: code.CancellationToken): code.ProviderResult<code.LinkedEditingRanges>;
}
/**
 * Linked editing middleware
 *
 * @since 3.16.0
 */
export interface LinkedEditingRangeMiddleware {
    provideLinkedEditingRange?: (this: void, document: code.TextDocument, position: code.Position, token: code.CancellationToken, next: ProvideLinkedEditingRangeSignature) => code.ProviderResult<code.LinkedEditingRanges>;
}
export declare class LinkedEditingFeature extends TextDocumentFeature<boolean | proto.LinkedEditingRangeOptions, proto.LinkedEditingRangeRegistrationOptions, code.LinkedEditingRangeProvider> {
    constructor(client: BaseLanguageClient);
    fillClientCapabilities(capabilities: proto.ClientCapabilities): void;
    initialize(capabilities: proto.ServerCapabilities, documentSelector: proto.DocumentSelector): void;
    protected registerLanguageProvider(options: proto.LinkedEditingRangeRegistrationOptions): [code.Disposable, code.LinkedEditingRangeProvider];
}

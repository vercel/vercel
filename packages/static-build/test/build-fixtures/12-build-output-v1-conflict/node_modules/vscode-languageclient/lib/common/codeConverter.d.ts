import * as code from 'vscode';
import * as proto from 'vscode-languageserver-protocol';
import { CreateFilesParams, DeleteFilesParams, RenameFilesParams } from 'vscode-languageserver-protocol/lib/common/protocol.fileOperations';
export interface FileFormattingOptions {
    trimTrailingWhitespace?: boolean;
    trimFinalNewlines?: boolean;
    insertFinalNewline?: boolean;
}
export interface Converter {
    asUri(uri: code.Uri): string;
    asTextDocumentIdentifier(textDocument: code.TextDocument): proto.TextDocumentIdentifier;
    asVersionedTextDocumentIdentifier(textDocument: code.TextDocument): proto.VersionedTextDocumentIdentifier;
    asOpenTextDocumentParams(textDocument: code.TextDocument): proto.DidOpenTextDocumentParams;
    asChangeTextDocumentParams(textDocument: code.TextDocument): proto.DidChangeTextDocumentParams;
    asChangeTextDocumentParams(event: code.TextDocumentChangeEvent): proto.DidChangeTextDocumentParams;
    asCloseTextDocumentParams(textDocument: code.TextDocument): proto.DidCloseTextDocumentParams;
    asSaveTextDocumentParams(textDocument: code.TextDocument, includeContent?: boolean): proto.DidSaveTextDocumentParams;
    asWillSaveTextDocumentParams(event: code.TextDocumentWillSaveEvent): proto.WillSaveTextDocumentParams;
    asDidCreateFilesParams(event: code.FileCreateEvent): CreateFilesParams;
    asDidRenameFilesParams(event: code.FileRenameEvent): RenameFilesParams;
    asDidDeleteFilesParams(event: code.FileDeleteEvent): DeleteFilesParams;
    asWillCreateFilesParams(event: code.FileCreateEvent): CreateFilesParams;
    asWillRenameFilesParams(event: code.FileRenameEvent): RenameFilesParams;
    asWillDeleteFilesParams(event: code.FileDeleteEvent): DeleteFilesParams;
    asTextDocumentPositionParams(textDocument: code.TextDocument, position: code.Position): proto.TextDocumentPositionParams;
    asCompletionParams(textDocument: code.TextDocument, position: code.Position, context: code.CompletionContext): proto.CompletionParams;
    asSignatureHelpParams(textDocument: code.TextDocument, position: code.Position, context: code.SignatureHelpContext): proto.SignatureHelpParams;
    asWorkerPosition(position: code.Position): proto.Position;
    asPosition(value: code.Position): proto.Position;
    asPosition(value: undefined): undefined;
    asPosition(value: null): null;
    asPosition(value: code.Position | undefined | null): proto.Position | undefined | null;
    asPositions(value: code.Position[]): proto.Position[];
    asRange(value: code.Range): proto.Range;
    asRange(value: undefined): undefined;
    asRange(value: null): null;
    asRange(value: code.Range | undefined | null): proto.Range | undefined | null;
    asLocation(value: code.Location): proto.Location;
    asLocation(value: undefined): undefined;
    asLocation(value: null): null;
    asLocation(value: code.Location | undefined | null): proto.Location | undefined | null;
    asDiagnosticSeverity(value: code.DiagnosticSeverity): number;
    asDiagnosticTag(value: code.DiagnosticTag): number | undefined;
    asDiagnostic(item: code.Diagnostic): proto.Diagnostic;
    asDiagnostics(items: code.Diagnostic[]): proto.Diagnostic[];
    asCompletionItem(item: code.CompletionItem): proto.CompletionItem;
    asSymbolKind(item: code.SymbolKind): proto.SymbolKind;
    asSymbolTag(item: code.SymbolTag): proto.SymbolTag;
    asSymbolTags(items: ReadonlyArray<code.SymbolTag>): proto.SymbolTag[];
    asTextEdit(edit: code.TextEdit): proto.TextEdit;
    asReferenceParams(textDocument: code.TextDocument, position: code.Position, options: {
        includeDeclaration: boolean;
    }): proto.ReferenceParams;
    asCodeAction(item: code.CodeAction): proto.CodeAction;
    asCodeActionContext(context: code.CodeActionContext): proto.CodeActionContext;
    asCommand(item: code.Command): proto.Command;
    asCodeLens(item: code.CodeLens): proto.CodeLens;
    asFormattingOptions(options: code.FormattingOptions, fileOptions: FileFormattingOptions): proto.FormattingOptions;
    asDocumentSymbolParams(textDocument: code.TextDocument): proto.DocumentSymbolParams;
    asCodeLensParams(textDocument: code.TextDocument): proto.CodeLensParams;
    asDocumentLink(item: code.DocumentLink): proto.DocumentLink;
    asDocumentLinkParams(textDocument: code.TextDocument): proto.DocumentLinkParams;
    asCallHierarchyItem(value: code.CallHierarchyItem): proto.CallHierarchyItem;
}
export interface URIConverter {
    (value: code.Uri): string;
}
export declare function createConverter(uriConverter?: URIConverter): Converter;

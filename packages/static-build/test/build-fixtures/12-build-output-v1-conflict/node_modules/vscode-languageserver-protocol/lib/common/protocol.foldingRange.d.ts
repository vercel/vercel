import { RequestHandler } from 'vscode-jsonrpc';
import { TextDocumentIdentifier, uinteger, FoldingRange } from 'vscode-languageserver-types';
import { ProtocolRequestType } from './messages';
import { TextDocumentRegistrationOptions, StaticRegistrationOptions, PartialResultParams, WorkDoneProgressParams, WorkDoneProgressOptions } from './protocol';
export interface FoldingRangeClientCapabilities {
    /**
     * Whether implementation supports dynamic registration for folding range providers. If this is set to `true`
     * the client supports the new `FoldingRangeRegistrationOptions` return value for the corresponding server
     * capability as well.
     */
    dynamicRegistration?: boolean;
    /**
     * The maximum number of folding ranges that the client prefers to receive per document. The value serves as a
     * hint, servers are free to follow the limit.
     */
    rangeLimit?: uinteger;
    /**
     * If set, the client signals that it only supports folding complete lines. If set, client will
     * ignore specified `startCharacter` and `endCharacter` properties in a FoldingRange.
     */
    lineFoldingOnly?: boolean;
}
export interface FoldingRangeOptions extends WorkDoneProgressOptions {
}
export interface FoldingRangeRegistrationOptions extends TextDocumentRegistrationOptions, FoldingRangeOptions, StaticRegistrationOptions {
}
/**
 * Enum of known range kinds
 */
export declare enum FoldingRangeKind {
    /**
     * Folding range for a comment
     */
    Comment = "comment",
    /**
     * Folding range for a imports or includes
     */
    Imports = "imports",
    /**
     * Folding range for a region (e.g. `#region`)
     */
    Region = "region"
}
/**
 * Parameters for a [FoldingRangeRequest](#FoldingRangeRequest).
 */
export interface FoldingRangeParams extends WorkDoneProgressParams, PartialResultParams {
    /**
     * The text document.
     */
    textDocument: TextDocumentIdentifier;
}
/**
 * A request to provide folding ranges in a document. The request's
 * parameter is of type [FoldingRangeParams](#FoldingRangeParams), the
 * response is of type [FoldingRangeList](#FoldingRangeList) or a Thenable
 * that resolves to such.
 */
export declare namespace FoldingRangeRequest {
    const method: 'textDocument/foldingRange';
    const type: ProtocolRequestType<FoldingRangeParams, FoldingRange[] | null, FoldingRange[], any, FoldingRangeRegistrationOptions>;
    type HandlerSignature = RequestHandler<FoldingRangeParams, FoldingRange[] | null, void>;
}

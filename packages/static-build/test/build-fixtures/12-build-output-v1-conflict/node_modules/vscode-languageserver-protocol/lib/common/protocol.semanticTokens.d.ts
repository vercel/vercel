import { TextDocumentIdentifier, Range, uinteger } from 'vscode-languageserver-types';
import { RequestHandler0, RequestHandler } from 'vscode-jsonrpc';
import { ProtocolRequestType, ProtocolRequestType0, RegistrationType } from './messages';
import { PartialResultParams, WorkDoneProgressParams, WorkDoneProgressOptions, TextDocumentRegistrationOptions, StaticRegistrationOptions } from './protocol';
/**
 * A set of predefined token types. This set is not fixed
 * an clients can specify additional token types via the
 * corresponding client capabilities.
 *
 * @since 3.16.0
 */
export declare enum SemanticTokenTypes {
    namespace = "namespace",
    /**
     * Represents a generic type. Acts as a fallback for types which can't be mapped to
     * a specific type like class or enum.
     */
    type = "type",
    class = "class",
    enum = "enum",
    interface = "interface",
    struct = "struct",
    typeParameter = "typeParameter",
    parameter = "parameter",
    variable = "variable",
    property = "property",
    enumMember = "enumMember",
    event = "event",
    function = "function",
    method = "method",
    macro = "macro",
    keyword = "keyword",
    modifier = "modifier",
    comment = "comment",
    string = "string",
    number = "number",
    regexp = "regexp",
    operator = "operator"
}
/**
 * A set of predefined token modifiers. This set is not fixed
 * an clients can specify additional token types via the
 * corresponding client capabilities.
 *
 * @since 3.16.0
 */
export declare enum SemanticTokenModifiers {
    declaration = "declaration",
    definition = "definition",
    readonly = "readonly",
    static = "static",
    deprecated = "deprecated",
    abstract = "abstract",
    async = "async",
    modification = "modification",
    documentation = "documentation",
    defaultLibrary = "defaultLibrary"
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensLegend {
    /**
     * The token types a server uses.
     */
    tokenTypes: string[];
    /**
     * The token modifiers a server uses.
     */
    tokenModifiers: string[];
}
/**
 * @since 3.16.0
 */
export interface SemanticTokens {
    /**
     * An optional result id. If provided and clients support delta updating
     * the client will include the result id in the next semantic token request.
     * A server can then instead of computing all semantic tokens again simply
     * send a delta.
     */
    resultId?: string;
    /**
     * The actual tokens.
     */
    data: uinteger[];
}
/**
 * @since 3.16.0
 */
export declare namespace SemanticTokens {
    function is(value: any): value is SemanticTokens;
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensPartialResult {
    data: uinteger[];
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensEdit {
    /**
     * The start offset of the edit.
     */
    start: uinteger;
    /**
     * The count of elements to remove.
     */
    deleteCount: uinteger;
    /**
     * The elements to insert.
     */
    data?: uinteger[];
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensDelta {
    readonly resultId?: string;
    /**
     * The semantic token edits to transform a previous result into a new result.
     */
    edits: SemanticTokensEdit[];
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensDeltaPartialResult {
    edits: SemanticTokensEdit[];
}
export declare namespace TokenFormat {
    const Relative: 'relative';
}
export declare type TokenFormat = 'relative';
/**
 * @since 3.16.0
 */
export interface SemanticTokensClientCapabilities {
    /**
     * Whether implementation supports dynamic registration. If this is set to `true`
     * the client supports the new `(TextDocumentRegistrationOptions & StaticRegistrationOptions)`
     * return value for the corresponding server capability as well.
     */
    dynamicRegistration?: boolean;
    /**
     * Which requests the client supports and might send to the server
     * depending on the server's capability. Please note that clients might not
     * show semantic tokens or degrade some of the user experience if a range
     * or full request is advertised by the client but not provided by the
     * server. If for example the client capability `requests.full` and
     * `request.range` are both set to true but the server only provides a
     * range provider the client might not render a minimap correctly or might
     * even decide to not show any semantic tokens at all.
     */
    requests: {
        /**
         * The client will send the `textDocument/semanticTokens/range` request if
         * the server provides a corresponding handler.
         */
        range?: boolean | {};
        /**
         * The client will send the `textDocument/semanticTokens/full` request if
         * the server provides a corresponding handler.
         */
        full?: boolean | {
            /**
             * The client will send the `textDocument/semanticTokens/full/delta` request if
             * the server provides a corresponding handler.
             */
            delta?: boolean;
        };
    };
    /**
     * The token types that the client supports.
     */
    tokenTypes: string[];
    /**
     * The token modifiers that the client supports.
     */
    tokenModifiers: string[];
    /**
     * The token formats the clients supports.
     */
    formats: TokenFormat[];
    /**
     * Whether the client supports tokens that can overlap each other.
     */
    overlappingTokenSupport?: boolean;
    /**
     * Whether the client supports tokens that can span multiple lines.
     */
    multilineTokenSupport?: boolean;
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensOptions extends WorkDoneProgressOptions {
    /**
     * The legend used by the server
     */
    legend: SemanticTokensLegend;
    /**
     * Server supports providing semantic tokens for a specific range
     * of a document.
     */
    range?: boolean | {};
    /**
     * Server supports providing semantic tokens for a full document.
     */
    full?: boolean | {
        /**
         * The server supports deltas for full documents.
         */
        delta?: boolean;
    };
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensRegistrationOptions extends TextDocumentRegistrationOptions, SemanticTokensOptions, StaticRegistrationOptions {
}
export declare namespace SemanticTokensRegistrationType {
    const method: 'textDocument/semanticTokens';
    const type: RegistrationType<SemanticTokensRegistrationOptions>;
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensParams extends WorkDoneProgressParams, PartialResultParams {
    /**
     * The text document.
     */
    textDocument: TextDocumentIdentifier;
}
/**
 * @since 3.16.0
 */
export declare namespace SemanticTokensRequest {
    const method: 'textDocument/semanticTokens/full';
    const type: ProtocolRequestType<SemanticTokensParams, SemanticTokens | null, SemanticTokensPartialResult, void, SemanticTokensRegistrationOptions>;
    type HandlerSignature = RequestHandler<SemanticTokensDeltaParams, SemanticTokens | null, void>;
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensDeltaParams extends WorkDoneProgressParams, PartialResultParams {
    /**
     * The text document.
     */
    textDocument: TextDocumentIdentifier;
    /**
     * The result id of a previous response. The result Id can either point to a full response
     * or a delta response depending on what was received last.
     */
    previousResultId: string;
}
/**
 * @since 3.16.0
 */
export declare namespace SemanticTokensDeltaRequest {
    const method: 'textDocument/semanticTokens/full/delta';
    const type: ProtocolRequestType<SemanticTokensDeltaParams, SemanticTokens | SemanticTokensDelta | null, SemanticTokensPartialResult | SemanticTokensDeltaPartialResult, void, SemanticTokensRegistrationOptions>;
    type HandlerSignature = RequestHandler<SemanticTokensDeltaParams, SemanticTokens | SemanticTokensDelta | null, void>;
}
/**
 * @since 3.16.0
 */
export interface SemanticTokensRangeParams extends WorkDoneProgressParams, PartialResultParams {
    /**
     * The text document.
     */
    textDocument: TextDocumentIdentifier;
    /**
     * The range the semantic tokens are requested for.
     */
    range: Range;
}
/**
 * @since 3.16.0
 */
export declare namespace SemanticTokensRangeRequest {
    const method: 'textDocument/semanticTokens/range';
    const type: ProtocolRequestType<SemanticTokensRangeParams, SemanticTokens | null, SemanticTokensPartialResult, void, void>;
    type HandlerSignature = RequestHandler<SemanticTokensRangeParams, SemanticTokens | null, void>;
}
export interface SemanticTokensWorkspaceClientCapabilities {
    /**
     * Whether the client implementation supports a refresh request sent from
     * the server to the client.
     *
     * Note that this event is global and will force the client to refresh all
     * semantic tokens currently shown. It should be used with absolute care
     * and is useful for situation where a server for example detect a project
     * wide change that requires such a calculation.
     */
    refreshSupport?: boolean;
}
/**
 * @since 3.16.0
 */
export declare namespace SemanticTokensRefreshRequest {
    const method: `workspace/semanticTokens/refresh`;
    const type: ProtocolRequestType0<void, void, void, void>;
    type HandlerSignature = RequestHandler0<void, void>;
}

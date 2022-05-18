import { RequestHandler } from 'vscode-jsonrpc';
import { Declaration, DeclarationLink, Location, LocationLink } from 'vscode-languageserver-types';
import { ProtocolRequestType } from './messages';
import { TextDocumentRegistrationOptions, StaticRegistrationOptions, TextDocumentPositionParams, PartialResultParams, WorkDoneProgressParams, WorkDoneProgressOptions } from './protocol';
/**
 * @since 3.14.0
 */
export interface DeclarationClientCapabilities {
    /**
     * Whether declaration supports dynamic registration. If this is set to `true`
     * the client supports the new `DeclarationRegistrationOptions` return value
     * for the corresponding server capability as well.
     */
    dynamicRegistration?: boolean;
    /**
     * The client supports additional metadata in the form of declaration links.
     */
    linkSupport?: boolean;
}
export interface DeclarationOptions extends WorkDoneProgressOptions {
}
export interface DeclarationRegistrationOptions extends DeclarationOptions, TextDocumentRegistrationOptions, StaticRegistrationOptions {
}
export interface DeclarationParams extends TextDocumentPositionParams, WorkDoneProgressParams, PartialResultParams {
}
/**
 * A request to resolve the type definition locations of a symbol at a given text
 * document position. The request's parameter is of type [TextDocumentPositioParams]
 * (#TextDocumentPositionParams) the response is of type [Declaration](#Declaration)
 * or a typed array of [DeclarationLink](#DeclarationLink) or a Thenable that resolves
 * to such.
 */
export declare namespace DeclarationRequest {
    const method: 'textDocument/declaration';
    const type: ProtocolRequestType<DeclarationParams, Location | Location[] | LocationLink[] | null, Location[] | LocationLink[], void, DeclarationRegistrationOptions>;
    type HandlerSignature = RequestHandler<DeclarationParams, Declaration | DeclarationLink[] | null, void>;
}

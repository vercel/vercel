import { RequestHandler } from 'vscode-jsonrpc';
import { Definition, DefinitionLink, LocationLink, Location } from 'vscode-languageserver-types';
import { ProtocolRequestType } from './messages';
import { TextDocumentRegistrationOptions, StaticRegistrationOptions, TextDocumentPositionParams, PartialResultParams, WorkDoneProgressParams, WorkDoneProgressOptions } from './protocol';
/**
 * Since 3.6.0
 */
export interface TypeDefinitionClientCapabilities {
    /**
     * Whether implementation supports dynamic registration. If this is set to `true`
     * the client supports the new `TypeDefinitionRegistrationOptions` return value
     * for the corresponding server capability as well.
     */
    dynamicRegistration?: boolean;
    /**
     * The client supports additional metadata in the form of definition links.
     *
     * Since 3.14.0
     */
    linkSupport?: boolean;
}
export interface TypeDefinitionOptions extends WorkDoneProgressOptions {
}
export interface TypeDefinitionRegistrationOptions extends TextDocumentRegistrationOptions, TypeDefinitionOptions, StaticRegistrationOptions {
}
export interface TypeDefinitionParams extends TextDocumentPositionParams, WorkDoneProgressParams, PartialResultParams {
}
/**
 * A request to resolve the type definition locations of a symbol at a given text
 * document position. The request's parameter is of type [TextDocumentPositioParams]
 * (#TextDocumentPositionParams) the response is of type [Definition](#Definition) or a
 * Thenable that resolves to such.
 */
export declare namespace TypeDefinitionRequest {
    const method: 'textDocument/typeDefinition';
    const type: ProtocolRequestType<TypeDefinitionParams, Location | Location[] | LocationLink[] | null, Location[] | LocationLink[], void, TypeDefinitionRegistrationOptions>;
    type HandlerSignature = RequestHandler<TypeDefinitionParams, Definition | DefinitionLink[] | null, void>;
}

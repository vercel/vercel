import { ProtocolRequestType } from './messages';
import { WorkDoneProgressOptions, WorkDoneProgressParams, PartialResultParams, TextDocumentRegistrationOptions, TextDocumentPositionParams } from './protocol';
/**
 * Moniker uniqueness level to define scope of the moniker.
 *
 * @since 3.16.0
 */
export declare enum UniquenessLevel {
    /**
     * The moniker is only unique inside a document
     */
    document = "document",
    /**
     * The moniker is unique inside a project for which a dump got created
     */
    project = "project",
    /**
     * The moniker is unique inside the group to which a project belongs
     */
    group = "group",
    /**
     * The moniker is unique inside the moniker scheme.
     */
    scheme = "scheme",
    /**
     * The moniker is globally unique
     */
    global = "global"
}
/**
 * The moniker kind.
 *
 * @since 3.16.0
 */
export declare enum MonikerKind {
    /**
     * The moniker represent a symbol that is imported into a project
     */
    import = "import",
    /**
     * The moniker represents a symbol that is exported from a project
     */
    export = "export",
    /**
     * The moniker represents a symbol that is local to a project (e.g. a local
     * variable of a function, a class not visible outside the project, ...)
     */
    local = "local"
}
/**
 * Moniker definition to match LSIF 0.5 moniker definition.
 *
 * @since 3.16.0
 */
export interface Moniker {
    /**
     * The scheme of the moniker. For example tsc or .Net
     */
    scheme: string;
    /**
     * The identifier of the moniker. The value is opaque in LSIF however
     * schema owners are allowed to define the structure if they want.
     */
    identifier: string;
    /**
     * The scope in which the moniker is unique
     */
    unique: UniquenessLevel;
    /**
     * The moniker kind if known.
     */
    kind?: MonikerKind;
}
/**
 * Client capabilities specific to the moniker request.
 *
 * @since 3.16.0
 */
export interface MonikerClientCapabilities {
    /**
     * Whether moniker supports dynamic registration. If this is set to `true`
     * the client supports the new `MonikerRegistrationOptions` return value
     * for the corresponding server capability as well.
     */
    dynamicRegistration?: boolean;
}
export interface MonikerServerCapabilities {
}
export interface MonikerOptions extends WorkDoneProgressOptions {
}
export interface MonikerRegistrationOptions extends TextDocumentRegistrationOptions, MonikerOptions {
}
export interface MonikerParams extends TextDocumentPositionParams, WorkDoneProgressParams, PartialResultParams {
}
/**
 * A request to get the moniker of a symbol at a given text document position.
 * The request parameter is of type [TextDocumentPositionParams](#TextDocumentPositionParams).
 * The response is of type [Moniker[]](#Moniker[]) or `null`.
 */
export declare namespace MonikerRequest {
    const method: 'textDocument/moniker';
    const type: ProtocolRequestType<MonikerParams, Moniker[] | null, Moniker[], void, MonikerRegistrationOptions>;
}

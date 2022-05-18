/**
 * A tagging type for string properties that are actually document URIs.
 */
export declare type DocumentUri = string;
/**
 * A tagging type for string properties that are actually URIs
 *
 * @since 3.16.0
 */
export declare type URI = string;
/**
 * Defines an integer in the range of -2^31 to 2^31 - 1.
 */
export declare type integer = number;
export declare namespace integer {
    const MIN_VALUE = -2147483648;
    const MAX_VALUE = 2147483647;
}
/**
 * Defines an unsigned integer in the range of 0 to 2^31 - 1.
 */
export declare type uinteger = number;
export declare namespace uinteger {
    const MIN_VALUE = 0;
    const MAX_VALUE = 2147483647;
}
/**
 * Defines a decimal number. Since decimal numbers are very
 * rare in the language server specification we denote the
 * exact range with every decimal using the mathematics
 * interval notations (e.g. [0, 1] denotes all decimals d with
 * 0 <= d <= 1.
 */
export declare type decimal = number;
/**
 * Position in a text document expressed as zero-based line and character offset.
 * The offsets are based on a UTF-16 string representation. So a string of the form
 * `a𐐀b` the character offset of the character `a` is 0, the character offset of `𐐀`
 * is 1 and the character offset of b is 3 since `𐐀` is represented using two code
 * units in UTF-16.
 *
 * Positions are line end character agnostic. So you can not specify a position that
 * denotes `\r|\n` or `\n|` where `|` represents the character offset.
 */
export interface Position {
    /**
     * Line position in a document (zero-based).
     */
    line: uinteger;
    /**
     * Character offset on a line in a document (zero-based). Assuming that the line is
     * represented as a string, the `character` value represents the gap between the
     * `character` and `character + 1`.
     *
     * If the character value is greater than the line length it defaults back to the
     * line length.
     */
    character: uinteger;
}
/**
 * The Position namespace provides helper functions to work with
 * [Position](#Position) literals.
 */
export declare namespace Position {
    /**
     * Creates a new Position literal from the given line and character.
     * @param line The position's line.
     * @param character The position's character.
     */
    function create(line: uinteger, character: uinteger): Position;
    /**
     * Checks whether the given literal conforms to the [Position](#Position) interface.
     */
    function is(value: any): value is Position;
}
/**
 * A range in a text document expressed as (zero-based) start and end positions.
 *
 * If you want to specify a range that contains a line including the line ending
 * character(s) then use an end position denoting the start of the next line.
 * For example:
 * ```ts
 * {
 *     start: { line: 5, character: 23 }
 *     end : { line 6, character : 0 }
 * }
 * ```
 */
export interface Range {
    /**
     * The range's start position
     */
    start: Position;
    /**
     * The range's end position.
     */
    end: Position;
}
/**
 * The Range namespace provides helper functions to work with
 * [Range](#Range) literals.
 */
export declare namespace Range {
    /**
     * Create a new Range literal.
     * @param start The range's start position.
     * @param end The range's end position.
     */
    function create(start: Position, end: Position): Range;
    /**
     * Create a new Range literal.
     * @param startLine The start line number.
     * @param startCharacter The start character.
     * @param endLine The end line number.
     * @param endCharacter The end character.
     */
    function create(startLine: uinteger, startCharacter: uinteger, endLine: uinteger, endCharacter: uinteger): Range;
    /**
     * Checks whether the given literal conforms to the [Range](#Range) interface.
     */
    function is(value: any): value is Range;
}
/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export interface Location {
    uri: DocumentUri;
    range: Range;
}
/**
 * The Location namespace provides helper functions to work with
 * [Location](#Location) literals.
 */
export declare namespace Location {
    /**
     * Creates a Location literal.
     * @param uri The location's uri.
     * @param range The location's range.
     */
    function create(uri: DocumentUri, range: Range): Location;
    /**
     * Checks whether the given literal conforms to the [Location](#Location) interface.
     */
    function is(value: any): value is Location;
}
/**
     * Represents the connection of two locations. Provides additional metadata over normal [locations](#Location),
     * including an origin range.
 */
export interface LocationLink {
    /**
     * Span of the origin of this link.
     *
     * Used as the underlined span for mouse definition hover. Defaults to the word range at
     * the definition position.
     */
    originSelectionRange?: Range;
    /**
     * The target resource identifier of this link.
     */
    targetUri: DocumentUri;
    /**
     * The full target range of this link. If the target for example is a symbol then target range is the
     * range enclosing this symbol not including leading/trailing whitespace but everything else
     * like comments. This information is typically used to highlight the range in the editor.
     */
    targetRange: Range;
    /**
     * The range that should be selected and revealed when this link is being followed, e.g the name of a function.
     * Must be contained by the the `targetRange`. See also `DocumentSymbol#range`
     */
    targetSelectionRange: Range;
}
/**
 * The LocationLink namespace provides helper functions to work with
 * [LocationLink](#LocationLink) literals.
 */
export declare namespace LocationLink {
    /**
     * Creates a LocationLink literal.
     * @param targetUri The definition's uri.
     * @param targetRange The full range of the definition.
     * @param targetSelectionRange The span of the symbol definition at the target.
     * @param originSelectionRange The span of the symbol being defined in the originating source file.
     */
    function create(targetUri: DocumentUri, targetRange: Range, targetSelectionRange: Range, originSelectionRange?: Range): LocationLink;
    /**
     * Checks whether the given literal conforms to the [LocationLink](#LocationLink) interface.
     */
    function is(value: any): value is LocationLink;
}
/**
 * Represents a color in RGBA space.
 */
export interface Color {
    /**
     * The red component of this color in the range [0-1].
     */
    readonly red: decimal;
    /**
     * The green component of this color in the range [0-1].
     */
    readonly green: decimal;
    /**
     * The blue component of this color in the range [0-1].
     */
    readonly blue: decimal;
    /**
     * The alpha component of this color in the range [0-1].
     */
    readonly alpha: decimal;
}
/**
 * The Color namespace provides helper functions to work with
 * [Color](#Color) literals.
 */
export declare namespace Color {
    /**
     * Creates a new Color literal.
     */
    function create(red: decimal, green: decimal, blue: decimal, alpha: decimal): Color;
    /**
     * Checks whether the given literal conforms to the [Color](#Color) interface.
     */
    function is(value: any): value is Color;
}
/**
 * Represents a color range from a document.
 */
export interface ColorInformation {
    /**
     * The range in the document where this color appears.
     */
    range: Range;
    /**
     * The actual color value for this color range.
     */
    color: Color;
}
/**
 * The ColorInformation namespace provides helper functions to work with
 * [ColorInformation](#ColorInformation) literals.
 */
export declare namespace ColorInformation {
    /**
     * Creates a new ColorInformation literal.
     */
    function create(range: Range, color: Color): ColorInformation;
    /**
     * Checks whether the given literal conforms to the [ColorInformation](#ColorInformation) interface.
     */
    function is(value: any): value is ColorInformation;
}
export interface ColorPresentation {
    /**
     * The label of this color presentation. It will be shown on the color
     * picker header. By default this is also the text that is inserted when selecting
     * this color presentation.
     */
    label: string;
    /**
     * An [edit](#TextEdit) which is applied to a document when selecting
     * this presentation for the color.  When `falsy` the [label](#ColorPresentation.label)
     * is used.
     */
    textEdit?: TextEdit;
    /**
     * An optional array of additional [text edits](#TextEdit) that are applied when
     * selecting this color presentation. Edits must not overlap with the main [edit](#ColorPresentation.textEdit) nor with themselves.
     */
    additionalTextEdits?: TextEdit[];
}
/**
 * The Color namespace provides helper functions to work with
 * [ColorPresentation](#ColorPresentation) literals.
 */
export declare namespace ColorPresentation {
    /**
     * Creates a new ColorInformation literal.
     */
    function create(label: string, textEdit?: TextEdit, additionalTextEdits?: TextEdit[]): ColorPresentation;
    /**
     * Checks whether the given literal conforms to the [ColorInformation](#ColorInformation) interface.
     */
    function is(value: any): value is ColorPresentation;
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
 * Represents a folding range. To be valid, start and end line must be bigger than zero and smaller
 * than the number of lines in the document. Clients are free to ignore invalid ranges.
 */
export interface FoldingRange {
    /**
     * The zero-based start line of the range to fold. The folded area starts after the line's last character.
     * To be valid, the end must be zero or larger and smaller than the number of lines in the document.
     */
    startLine: uinteger;
    /**
     * The zero-based character offset from where the folded range starts. If not defined, defaults to the length of the start line.
     */
    startCharacter?: uinteger;
    /**
     * The zero-based end line of the range to fold. The folded area ends with the line's last character.
     * To be valid, the end must be zero or larger and smaller than the number of lines in the document.
     */
    endLine: uinteger;
    /**
     * The zero-based character offset before the folded range ends. If not defined, defaults to the length of the end line.
     */
    endCharacter?: uinteger;
    /**
     * Describes the kind of the folding range such as `comment' or 'region'. The kind
     * is used to categorize folding ranges and used by commands like 'Fold all comments'. See
     * [FoldingRangeKind](#FoldingRangeKind) for an enumeration of standardized kinds.
     */
    kind?: string;
}
/**
 * The folding range namespace provides helper functions to work with
 * [FoldingRange](#FoldingRange) literals.
 */
export declare namespace FoldingRange {
    /**
     * Creates a new FoldingRange literal.
     */
    function create(startLine: uinteger, endLine: uinteger, startCharacter?: uinteger, endCharacter?: uinteger, kind?: string): FoldingRange;
    /**
     * Checks whether the given literal conforms to the [FoldingRange](#FoldingRange) interface.
     */
    function is(value: any): value is FoldingRange;
}
/**
 * Represents a related message and source code location for a diagnostic. This should be
 * used to point to code locations that cause or related to a diagnostics, e.g when duplicating
 * a symbol in a scope.
 */
export interface DiagnosticRelatedInformation {
    /**
     * The location of this related diagnostic information.
     */
    location: Location;
    /**
     * The message of this related diagnostic information.
     */
    message: string;
}
/**
 * The DiagnosticRelatedInformation namespace provides helper functions to work with
 * [DiagnosticRelatedInformation](#DiagnosticRelatedInformation) literals.
 */
export declare namespace DiagnosticRelatedInformation {
    /**
     * Creates a new DiagnosticRelatedInformation literal.
     */
    function create(location: Location, message: string): DiagnosticRelatedInformation;
    /**
     * Checks whether the given literal conforms to the [DiagnosticRelatedInformation](#DiagnosticRelatedInformation) interface.
     */
    function is(value: any): value is DiagnosticRelatedInformation;
}
/**
 * The diagnostic's severity.
 */
export declare namespace DiagnosticSeverity {
    /**
     * Reports an error.
     */
    const Error: 1;
    /**
     * Reports a warning.
     */
    const Warning: 2;
    /**
     * Reports an information.
     */
    const Information: 3;
    /**
     * Reports a hint.
     */
    const Hint: 4;
}
export declare type DiagnosticSeverity = 1 | 2 | 3 | 4;
/**
 * The diagnostic tags.
 *
 * @since 3.15.0
 */
export declare namespace DiagnosticTag {
    /**
     * Unused or unnecessary code.
     *
     * Clients are allowed to render diagnostics with this tag faded out instead of having
     * an error squiggle.
     */
    const Unnecessary: 1;
    /**
     * Deprecated or obsolete code.
     *
     * Clients are allowed to rendered diagnostics with this tag strike through.
     */
    const Deprecated: 2;
}
export declare type DiagnosticTag = 1 | 2;
/**
 * Structure to capture a description for an error code.
 *
 * @since 3.16.0
 */
export interface CodeDescription {
    /**
     * An URI to open with more information about the diagnostic error.
     */
    href: URI;
}
/**
 * The CodeDescription namespace provides functions to deal with descriptions for diagnostic codes.
 *
 * @since 3.16.0
 */
export declare namespace CodeDescription {
    function is(value: CodeDescription | undefined | null): value is CodeDescription;
}
/**
 * Represents a diagnostic, such as a compiler error or warning. Diagnostic objects
 * are only valid in the scope of a resource.
 */
export interface Diagnostic {
    /**
     * The range at which the message applies
     */
    range: Range;
    /**
     * The diagnostic's severity. Can be omitted. If omitted it is up to the
     * client to interpret diagnostics as error, warning, info or hint.
     */
    severity?: DiagnosticSeverity;
    /**
     * The diagnostic's code, which usually appear in the user interface.
     */
    code?: integer | string;
    /**
     * An optional property to describe the error code.
     *
     * @since 3.16.0
     */
    codeDescription?: CodeDescription;
    /**
     * A human-readable string describing the source of this
     * diagnostic, e.g. 'typescript' or 'super lint'. It usually
     * appears in the user interface.
     */
    source?: string;
    /**
     * The diagnostic's message. It usually appears in the user interface
     */
    message: string;
    /**
     * Additional metadata about the diagnostic.
     *
     * @since 3.15.0
     */
    tags?: DiagnosticTag[];
    /**
     * An array of related diagnostic information, e.g. when symbol-names within
     * a scope collide all definitions can be marked via this property.
     */
    relatedInformation?: DiagnosticRelatedInformation[];
    /**
     * A data entry field that is preserved between a `textDocument/publishDiagnostics`
     * notification and `textDocument/codeAction` request.
     *
     * @since 3.16.0
     */
    data?: unknown;
}
/**
 * The Diagnostic namespace provides helper functions to work with
 * [Diagnostic](#Diagnostic) literals.
 */
export declare namespace Diagnostic {
    /**
     * Creates a new Diagnostic literal.
     */
    function create(range: Range, message: string, severity?: DiagnosticSeverity, code?: integer | string, source?: string, relatedInformation?: DiagnosticRelatedInformation[]): Diagnostic;
    /**
     * Checks whether the given literal conforms to the [Diagnostic](#Diagnostic) interface.
     */
    function is(value: any): value is Diagnostic;
}
/**
 * Represents a reference to a command. Provides a title which
 * will be used to represent a command in the UI and, optionally,
 * an array of arguments which will be passed to the command handler
 * function when invoked.
 */
export interface Command {
    /**
     * Title of the command, like `save`.
     */
    title: string;
    /**
     * The identifier of the actual command handler.
     */
    command: string;
    /**
     * Arguments that the command handler should be
     * invoked with.
     */
    arguments?: any[];
}
/**
 * The Command namespace provides helper functions to work with
 * [Command](#Command) literals.
 */
export declare namespace Command {
    /**
     * Creates a new Command literal.
     */
    function create(title: string, command: string, ...args: any[]): Command;
    /**
     * Checks whether the given literal conforms to the [Command](#Command) interface.
     */
    function is(value: any): value is Command;
}
/**
 * A text edit applicable to a text document.
 */
export interface TextEdit {
    /**
     * The range of the text document to be manipulated. To insert
     * text into a document create a range where start === end.
     */
    range: Range;
    /**
     * The string to be inserted. For delete operations use an
     * empty string.
     */
    newText: string;
}
/**
 * The TextEdit namespace provides helper function to create replace,
 * insert and delete edits more easily.
 */
export declare namespace TextEdit {
    /**
     * Creates a replace text edit.
     * @param range The range of text to be replaced.
     * @param newText The new text.
     */
    function replace(range: Range, newText: string): TextEdit;
    /**
     * Creates a insert text edit.
     * @param position The position to insert the text at.
     * @param newText The text to be inserted.
     */
    function insert(position: Position, newText: string): TextEdit;
    /**
     * Creates a delete text edit.
     * @param range The range of text to be deleted.
     */
    function del(range: Range): TextEdit;
    function is(value: any): value is TextEdit;
}
/**
 * Additional information that describes document changes.
 *
 * @since 3.16.0
 */
export interface ChangeAnnotation {
    /**
     * A human-readable string describing the actual change. The string
     * is rendered prominent in the user interface.
     */
    label: string;
    /**
     * A flag which indicates that user confirmation is needed
     * before applying the change.
     */
    needsConfirmation?: boolean;
    /**
     * A human-readable string which is rendered less prominent in
     * the user interface.
     */
    description?: string;
}
export declare namespace ChangeAnnotation {
    function create(label: string, needsConfirmation?: boolean, description?: string): ChangeAnnotation;
    function is(value: any): value is ChangeAnnotation;
}
export declare namespace ChangeAnnotationIdentifier {
    function is(value: any): value is ChangeAnnotationIdentifier;
}
/**
 * An identifier to refer to a change annotation stored with a workspace edit.
 */
export declare type ChangeAnnotationIdentifier = string;
/**
 * A special text edit with an additional change annotation.
 *
 * @since 3.16.0.
 */
export interface AnnotatedTextEdit extends TextEdit {
    /**
     * The actual identifier of the change annotation
     */
    annotationId: ChangeAnnotationIdentifier;
}
export declare namespace AnnotatedTextEdit {
    /**
     * Creates an annotated replace text edit.
     *
     * @param range The range of text to be replaced.
     * @param newText The new text.
     * @param annotation The annotation.
     */
    function replace(range: Range, newText: string, annotation: ChangeAnnotationIdentifier): AnnotatedTextEdit;
    /**
     * Creates an annotated insert text edit.
     *
     * @param position The position to insert the text at.
     * @param newText The text to be inserted.
     * @param annotation The annotation.
     */
    function insert(position: Position, newText: string, annotation: ChangeAnnotationIdentifier): AnnotatedTextEdit;
    /**
     * Creates an annotated delete text edit.
     *
     * @param range The range of text to be deleted.
     * @param annotation The annotation.
     */
    function del(range: Range, annotation: ChangeAnnotationIdentifier): AnnotatedTextEdit;
    function is(value: any): value is AnnotatedTextEdit;
}
/**
 * Describes textual changes on a text document. A TextDocumentEdit describes all changes
 * on a document version Si and after they are applied move the document to version Si+1.
 * So the creator of a TextDocumentEdit doesn't need to sort the array of edits or do any
 * kind of ordering. However the edits must be non overlapping.
 */
export interface TextDocumentEdit {
    /**
     * The text document to change.
     */
    textDocument: OptionalVersionedTextDocumentIdentifier;
    /**
     * The edits to be applied.
     *
     * @since 3.16.0 - support for AnnotatedTextEdit. This is guarded using a
     * client capability.
     */
    edits: (TextEdit | AnnotatedTextEdit)[];
}
/**
 * The TextDocumentEdit namespace provides helper function to create
 * an edit that manipulates a text document.
 */
export declare namespace TextDocumentEdit {
    /**
     * Creates a new `TextDocumentEdit`
     */
    function create(textDocument: OptionalVersionedTextDocumentIdentifier, edits: (TextEdit | AnnotatedTextEdit)[]): TextDocumentEdit;
    function is(value: any): value is TextDocumentEdit;
}
/**
 * A generic resource operation.
 */
interface ResourceOperation {
    /**
     * The resource operation kind.
     */
    kind: string;
    /**
     * An optional annotation identifier describing the operation.
     *
     * @since 3.16.0
     */
    annotationId?: ChangeAnnotationIdentifier;
}
/**
 * Options to create a file.
 */
export interface CreateFileOptions {
    /**
     * Overwrite existing file. Overwrite wins over `ignoreIfExists`
     */
    overwrite?: boolean;
    /**
     * Ignore if exists.
     */
    ignoreIfExists?: boolean;
}
/**
 * Create file operation.
 */
export interface CreateFile extends ResourceOperation {
    /**
     * A create
     */
    kind: 'create';
    /**
     * The resource to create.
     */
    uri: DocumentUri;
    /**
     * Additional options
     */
    options?: CreateFileOptions;
}
export declare namespace CreateFile {
    function create(uri: DocumentUri, options?: CreateFileOptions, annotation?: ChangeAnnotationIdentifier): CreateFile;
    function is(value: any): value is CreateFile;
}
/**
 * Rename file options
 */
export interface RenameFileOptions {
    /**
     * Overwrite target if existing. Overwrite wins over `ignoreIfExists`
     */
    overwrite?: boolean;
    /**
     * Ignores if target exists.
     */
    ignoreIfExists?: boolean;
}
/**
 * Rename file operation
 */
export interface RenameFile extends ResourceOperation {
    /**
     * A rename
     */
    kind: 'rename';
    /**
     * The old (existing) location.
     */
    oldUri: DocumentUri;
    /**
     * The new location.
     */
    newUri: DocumentUri;
    /**
     * Rename options.
     */
    options?: RenameFileOptions;
}
export declare namespace RenameFile {
    function create(oldUri: DocumentUri, newUri: DocumentUri, options?: RenameFileOptions, annotation?: ChangeAnnotationIdentifier): RenameFile;
    function is(value: any): value is RenameFile;
}
/**
 * Delete file options
 */
export interface DeleteFileOptions {
    /**
     * Delete the content recursively if a folder is denoted.
     */
    recursive?: boolean;
    /**
     * Ignore the operation if the file doesn't exist.
     */
    ignoreIfNotExists?: boolean;
}
/**
 * Delete file operation
 */
export interface DeleteFile extends ResourceOperation {
    /**
     * A delete
     */
    kind: 'delete';
    /**
     * The file to delete.
     */
    uri: DocumentUri;
    /**
     * Delete options.
     */
    options?: DeleteFileOptions;
}
export declare namespace DeleteFile {
    function create(uri: DocumentUri, options?: DeleteFileOptions, annotation?: ChangeAnnotationIdentifier): DeleteFile;
    function is(value: any): value is DeleteFile;
}
/**
 * A workspace edit represents changes to many resources managed in the workspace. The edit
 * should either provide `changes` or `documentChanges`. If documentChanges are present
 * they are preferred over `changes` if the client can handle versioned document edits.
 */
export interface WorkspaceEdit {
    /**
     * Holds changes to existing resources.
     */
    changes?: {
        [uri: string]: TextEdit[];
    };
    /**
     * Depending on the client capability `workspace.workspaceEdit.resourceOperations` document changes
     * are either an array of `TextDocumentEdit`s to express changes to n different text documents
     * where each text document edit addresses a specific version of a text document. Or it can contain
     * above `TextDocumentEdit`s mixed with create, rename and delete file / folder operations.
     *
     * Whether a client supports versioned document edits is expressed via
     * `workspace.workspaceEdit.documentChanges` client capability.
     *
     * If a client neither supports `documentChanges` nor `workspace.workspaceEdit.resourceOperations` then
     * only plain `TextEdit`s using the `changes` property are supported.
     */
    documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[];
    /**
     * A map of change annotations that can be referenced in `AnnotatedTextEdit`s or create, rename and
     * delete file / folder operations.
     *
     * Whether clients honor this property depends on the client capability `workspace.changeAnnotationSupport`.
     *
     * @since 3.16.0
     */
    changeAnnotations?: {
        [id: string]: ChangeAnnotation;
    };
}
export declare namespace WorkspaceEdit {
    function is(value: any): value is WorkspaceEdit;
}
/**
 * A change to capture text edits for existing resources.
 */
export interface TextEditChange {
    /**
     * Gets all text edits for this change.
     *
     * @return An array of text edits.
     *
     * @since 3.16.0 - support for annotated text edits. This is usually
     * guarded using a client capability.
     */
    all(): (TextEdit | AnnotatedTextEdit)[];
    /**
     * Clears the edits for this change.
     */
    clear(): void;
    /**
     * Adds a text edit.
     *
     * @param edit the text edit to add.
     *
     * @since 3.16.0 - support for annotated text edits. This is usually
     * guarded using a client capability.
     */
    add(edit: TextEdit | AnnotatedTextEdit): void;
    /**
     * Insert the given text at the given position.
     *
     * @param position A position.
     * @param newText A string.
     * @param annotation An optional annotation.
     */
    insert(position: Position, newText: string): void;
    insert(position: Position, newText: string, annotation: ChangeAnnotation | ChangeAnnotationIdentifier): ChangeAnnotationIdentifier;
    /**
     * Replace the given range with given text for the given resource.
     *
     * @param range A range.
     * @param newText A string.
     * @param annotation An optional annotation.
     */
    replace(range: Range, newText: string): void;
    replace(range: Range, newText: string, annotation?: ChangeAnnotation | ChangeAnnotationIdentifier): ChangeAnnotationIdentifier;
    /**
     * Delete the text at the given range.
     *
     * @param range A range.
     * @param annotation An optional annotation.
     */
    delete(range: Range): void;
    delete(range: Range, annotation?: ChangeAnnotation | ChangeAnnotationIdentifier): ChangeAnnotationIdentifier;
}
/**
 * A workspace change helps constructing changes to a workspace.
 */
export declare class WorkspaceChange {
    private _workspaceEdit;
    private _textEditChanges;
    private _changeAnnotations;
    constructor(workspaceEdit?: WorkspaceEdit);
    /**
     * Returns the underlying [WorkspaceEdit](#WorkspaceEdit) literal
     * use to be returned from a workspace edit operation like rename.
     */
    get edit(): WorkspaceEdit;
    /**
     * Returns the [TextEditChange](#TextEditChange) to manage text edits
     * for resources.
     */
    getTextEditChange(textDocument: OptionalVersionedTextDocumentIdentifier): TextEditChange;
    getTextEditChange(uri: DocumentUri): TextEditChange;
    private initDocumentChanges;
    private initChanges;
    createFile(uri: DocumentUri, options?: CreateFileOptions): void;
    createFile(uri: DocumentUri, annotation: ChangeAnnotation | ChangeAnnotationIdentifier, options?: CreateFileOptions): ChangeAnnotationIdentifier;
    renameFile(oldUri: DocumentUri, newUri: DocumentUri, options?: RenameFileOptions): void;
    renameFile(oldUri: DocumentUri, newUri: DocumentUri, annotation?: ChangeAnnotation | ChangeAnnotationIdentifier, options?: RenameFileOptions): ChangeAnnotationIdentifier;
    deleteFile(uri: DocumentUri, options?: DeleteFileOptions): void;
    deleteFile(uri: DocumentUri, annotation: ChangeAnnotation | ChangeAnnotationIdentifier, options?: DeleteFileOptions): ChangeAnnotationIdentifier;
}
/**
 * A literal to identify a text document in the client.
 */
export interface TextDocumentIdentifier {
    /**
     * The text document's uri.
     */
    uri: DocumentUri;
}
/**
 * The TextDocumentIdentifier namespace provides helper functions to work with
 * [TextDocumentIdentifier](#TextDocumentIdentifier) literals.
 */
export declare namespace TextDocumentIdentifier {
    /**
     * Creates a new TextDocumentIdentifier literal.
     * @param uri The document's uri.
     */
    function create(uri: DocumentUri): TextDocumentIdentifier;
    /**
     * Checks whether the given literal conforms to the [TextDocumentIdentifier](#TextDocumentIdentifier) interface.
     */
    function is(value: any): value is TextDocumentIdentifier;
}
/**
 * A text document identifier to denote a specific version of a text document.
 */
export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
    /**
     * The version number of this document.
     */
    version: integer;
}
/**
 * The VersionedTextDocumentIdentifier namespace provides helper functions to work with
 * [VersionedTextDocumentIdentifier](#VersionedTextDocumentIdentifier) literals.
 */
export declare namespace VersionedTextDocumentIdentifier {
    /**
     * Creates a new VersionedTextDocumentIdentifier literal.
     * @param uri The document's uri.
     * @param uri The document's text.
     */
    function create(uri: DocumentUri, version: integer): VersionedTextDocumentIdentifier;
    /**
     * Checks whether the given literal conforms to the [VersionedTextDocumentIdentifier](#VersionedTextDocumentIdentifier) interface.
     */
    function is(value: any): value is VersionedTextDocumentIdentifier;
}
/**
 * A text document identifier to optionally denote a specific version of a text document.
 */
export interface OptionalVersionedTextDocumentIdentifier extends TextDocumentIdentifier {
    /**
     * The version number of this document. If a versioned text document identifier
     * is sent from the server to the client and the file is not open in the editor
     * (the server has not received an open notification before) the server can send
     * `null` to indicate that the version is unknown and the content on disk is the
     * truth (as specified with document content ownership).
     */
    version: integer | null;
}
/**
 * The OptionalVersionedTextDocumentIdentifier namespace provides helper functions to work with
 * [OptionalVersionedTextDocumentIdentifier](#OptionalVersionedTextDocumentIdentifier) literals.
 */
export declare namespace OptionalVersionedTextDocumentIdentifier {
    /**
     * Creates a new OptionalVersionedTextDocumentIdentifier literal.
     * @param uri The document's uri.
     * @param uri The document's text.
     */
    function create(uri: DocumentUri, version: integer | null): OptionalVersionedTextDocumentIdentifier;
    /**
     * Checks whether the given literal conforms to the [OptionalVersionedTextDocumentIdentifier](#OptionalVersionedTextDocumentIdentifier) interface.
     */
    function is(value: any): value is OptionalVersionedTextDocumentIdentifier;
}
/**
 * An item to transfer a text document from the client to the
 * server.
 */
export interface TextDocumentItem {
    /**
     * The text document's uri.
     */
    uri: DocumentUri;
    /**
     * The text document's language identifier
     */
    languageId: string;
    /**
     * The version number of this document (it will increase after each
     * change, including undo/redo).
     */
    version: integer;
    /**
     * The content of the opened text document.
     */
    text: string;
}
/**
 * The TextDocumentItem namespace provides helper functions to work with
 * [TextDocumentItem](#TextDocumentItem) literals.
 */
export declare namespace TextDocumentItem {
    /**
     * Creates a new TextDocumentItem literal.
     * @param uri The document's uri.
     * @param languageId The document's language identifier.
     * @param version The document's version number.
     * @param text The document's text.
     */
    function create(uri: DocumentUri, languageId: string, version: integer, text: string): TextDocumentItem;
    /**
     * Checks whether the given literal conforms to the [TextDocumentItem](#TextDocumentItem) interface.
     */
    function is(value: any): value is TextDocumentItem;
}
/**
 * Describes the content type that a client supports in various
 * result literals like `Hover`, `ParameterInfo` or `CompletionItem`.
 *
 * Please note that `MarkupKinds` must not start with a `$`. This kinds
 * are reserved for internal usage.
 */
export declare namespace MarkupKind {
    /**
     * Plain text is supported as a content format
     */
    const PlainText: 'plaintext';
    /**
     * Markdown is supported as a content format
     */
    const Markdown: 'markdown';
}
export declare type MarkupKind = 'plaintext' | 'markdown';
export declare namespace MarkupKind {
    /**
     * Checks whether the given value is a value of the [MarkupKind](#MarkupKind) type.
     */
    function is(value: any): value is MarkupKind;
}
/**
 * A `MarkupContent` literal represents a string value which content is interpreted base on its
 * kind flag. Currently the protocol supports `plaintext` and `markdown` as markup kinds.
 *
 * If the kind is `markdown` then the value can contain fenced code blocks like in GitHub issues.
 * See https://help.github.com/articles/creating-and-highlighting-code-blocks/#syntax-highlighting
 *
 * Here is an example how such a string can be constructed using JavaScript / TypeScript:
 * ```ts
 * let markdown: MarkdownContent = {
 *  kind: MarkupKind.Markdown,
 *	value: [
 *		'# Header',
 *		'Some text',
 *		'```typescript',
 *		'someCode();',
 *		'```'
 *	].join('\n')
 * };
 * ```
 *
 * *Please Note* that clients might sanitize the return markdown. A client could decide to
 * remove HTML from the markdown to avoid script execution.
 */
export interface MarkupContent {
    /**
     * The type of the Markup
     */
    kind: MarkupKind;
    /**
     * The content itself
     */
    value: string;
}
export declare namespace MarkupContent {
    /**
     * Checks whether the given value conforms to the [MarkupContent](#MarkupContent) interface.
     */
    function is(value: any): value is MarkupContent;
}
/**
 * The kind of a completion entry.
 */
export declare namespace CompletionItemKind {
    const Text: 1;
    const Method: 2;
    const Function: 3;
    const Constructor: 4;
    const Field: 5;
    const Variable: 6;
    const Class: 7;
    const Interface: 8;
    const Module: 9;
    const Property: 10;
    const Unit: 11;
    const Value: 12;
    const Enum: 13;
    const Keyword: 14;
    const Snippet: 15;
    const Color: 16;
    const File: 17;
    const Reference: 18;
    const Folder: 19;
    const EnumMember: 20;
    const Constant: 21;
    const Struct: 22;
    const Event: 23;
    const Operator: 24;
    const TypeParameter: 25;
}
export declare type CompletionItemKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25;
/**
 * Defines whether the insert text in a completion item should be interpreted as
 * plain text or a snippet.
 */
export declare namespace InsertTextFormat {
    /**
     * The primary text to be inserted is treated as a plain string.
     */
    const PlainText: 1;
    /**
     * The primary text to be inserted is treated as a snippet.
     *
     * A snippet can define tab stops and placeholders with `$1`, `$2`
     * and `${3:foo}`. `$0` defines the final tab stop, it defaults to
     * the end of the snippet. Placeholders with equal identifiers are linked,
     * that is typing in one will update others too.
     *
     * See also: https://microsoft.github.io/language-server-protocol/specifications/specification-current/#snippet_syntax
     */
    const Snippet: 2;
}
export declare type InsertTextFormat = 1 | 2;
/**
 * Completion item tags are extra annotations that tweak the rendering of a completion
 * item.
 *
 * @since 3.15.0
 */
export declare namespace CompletionItemTag {
    /**
     * Render a completion as obsolete, usually using a strike-out.
     */
    const Deprecated = 1;
}
export declare type CompletionItemTag = 1;
/**
 * A special text edit to provide an insert and a replace operation.
 *
 * @since 3.16.0
 */
export interface InsertReplaceEdit {
    /**
     * The string to be inserted.
     */
    newText: string;
    /**
     * The range if the insert is requested
     */
    insert: Range;
    /**
     * The range if the replace is requested.
     */
    replace: Range;
}
/**
 * The InsertReplaceEdit namespace provides functions to deal with insert / replace edits.
 *
 * @since 3.16.0
 */
export declare namespace InsertReplaceEdit {
    /**
     * Creates a new insert / replace edit
     */
    function create(newText: string, insert: Range, replace: Range): InsertReplaceEdit;
    /**
     * Checks whether the given literal conforms to the [InsertReplaceEdit](#InsertReplaceEdit) interface.
     */
    function is(value: TextEdit | InsertReplaceEdit): value is InsertReplaceEdit;
}
/**
 * How whitespace and indentation is handled during completion
 * item insertion.
 *
 * @since 3.16.0
 */
export declare namespace InsertTextMode {
    /**
     * The insertion or replace strings is taken as it is. If the
     * value is multi line the lines below the cursor will be
     * inserted using the indentation defined in the string value.
     * The client will not apply any kind of adjustments to the
     * string.
     */
    const asIs: 1;
    /**
     * The editor adjusts leading whitespace of new lines so that
     * they match the indentation up to the cursor of the line for
     * which the item is accepted.
     *
     * Consider a line like this: <2tabs><cursor><3tabs>foo. Accepting a
     * multi line completion item is indented using 2 tabs and all
     * following lines inserted will be indented using 2 tabs as well.
     */
    const adjustIndentation: 2;
}
export declare type InsertTextMode = 1 | 2;
/**
 * A completion item represents a text snippet that is
 * proposed to complete text that is being typed.
 */
export interface CompletionItem {
    /**
     * The label of this completion item. By default
     * also the text that is inserted when selecting
     * this completion.
     */
    label: string;
    /**
     * The kind of this completion item. Based of the kind
     * an icon is chosen by the editor.
     */
    kind?: CompletionItemKind;
    /**
     * Tags for this completion item.
     *
     * @since 3.15.0
     */
    tags?: CompletionItemTag[];
    /**
     * A human-readable string with additional information
     * about this item, like type or symbol information.
     */
    detail?: string;
    /**
     * A human-readable string that represents a doc-comment.
     */
    documentation?: string | MarkupContent;
    /**
     * Indicates if this item is deprecated.
     * @deprecated Use `tags` instead.
     */
    deprecated?: boolean;
    /**
     * Select this item when showing.
     *
     * *Note* that only one completion item can be selected and that the
     * tool / client decides which item that is. The rule is that the *first*
     * item of those that match best is selected.
     */
    preselect?: boolean;
    /**
     * A string that should be used when comparing this item
     * with other items. When `falsy` the [label](#CompletionItem.label)
     * is used.
     */
    sortText?: string;
    /**
     * A string that should be used when filtering a set of
     * completion items. When `falsy` the [label](#CompletionItem.label)
     * is used.
     */
    filterText?: string;
    /**
     * A string that should be inserted into a document when selecting
     * this completion. When `falsy` the [label](#CompletionItem.label)
     * is used.
     *
     * The `insertText` is subject to interpretation by the client side.
     * Some tools might not take the string literally. For example
     * VS Code when code complete is requested in this example `con<cursor position>`
     * and a completion item with an `insertText` of `console` is provided it
     * will only insert `sole`. Therefore it is recommended to use `textEdit` instead
     * since it avoids additional client side interpretation.
     */
    insertText?: string;
    /**
     * The format of the insert text. The format applies to both the `insertText` property
     * and the `newText` property of a provided `textEdit`. If omitted defaults to
     * `InsertTextFormat.PlainText`.
     */
    insertTextFormat?: InsertTextFormat;
    /**
     * How whitespace and indentation is handled during completion
     * item insertion. If ignored the clients default value depends on
     * the `textDocument.completion.insertTextMode` client capability.
     *
     * @since 3.16.0
     */
    insertTextMode?: InsertTextMode;
    /**
     * An [edit](#TextEdit) which is applied to a document when selecting
     * this completion. When an edit is provided the value of
     * [insertText](#CompletionItem.insertText) is ignored.
     *
     * Most editors support two different operation when accepting a completion item. One is to insert a
     * completion text and the other is to replace an existing text with a completion text. Since this can
     * usually not predetermined by a server it can report both ranges. Clients need to signal support for
     * `InsertReplaceEdits` via the `textDocument.completion.insertReplaceSupport` client capability
     * property.
     *
     * *Note 1:* The text edit's range as well as both ranges from a insert replace edit must be a
     * [single line] and they must contain the position at which completion has been requested.
     * *Note 2:* If an `InsertReplaceEdit` is returned the edit's insert range must be a prefix of
     * the edit's replace range, that means it must be contained and starting at the same position.
     *
     * @since 3.16.0 additional type `InsertReplaceEdit`
     */
    textEdit?: TextEdit | InsertReplaceEdit;
    /**
     * An optional array of additional [text edits](#TextEdit) that are applied when
     * selecting this completion. Edits must not overlap (including the same insert position)
     * with the main [edit](#CompletionItem.textEdit) nor with themselves.
     *
     * Additional text edits should be used to change text unrelated to the current cursor position
     * (for example adding an import statement at the top of the file if the completion item will
     * insert an unqualified type).
     */
    additionalTextEdits?: TextEdit[];
    /**
     * An optional set of characters that when pressed while this completion is active will accept it first and
     * then type that character. *Note* that all commit characters should have `length=1` and that superfluous
     * characters will be ignored.
     */
    commitCharacters?: string[];
    /**
     * An optional [command](#Command) that is executed *after* inserting this completion. *Note* that
     * additional modifications to the current document should be described with the
     * [additionalTextEdits](#CompletionItem.additionalTextEdits)-property.
     */
    command?: Command;
    /**
     * A data entry field that is preserved on a completion item between
     * a [CompletionRequest](#CompletionRequest) and a [CompletionResolveRequest]
     * (#CompletionResolveRequest)
     */
    data?: any;
}
/**
 * The CompletionItem namespace provides functions to deal with
 * completion items.
 */
export declare namespace CompletionItem {
    /**
     * Create a completion item and seed it with a label.
     * @param label The completion item's label
     */
    function create(label: string): CompletionItem;
}
/**
 * Represents a collection of [completion items](#CompletionItem) to be presented
 * in the editor.
 */
export interface CompletionList {
    /**
     * This list it not complete. Further typing results in recomputing this list.
     */
    isIncomplete: boolean;
    /**
     * The completion items.
     */
    items: CompletionItem[];
}
/**
 * The CompletionList namespace provides functions to deal with
 * completion lists.
 */
export declare namespace CompletionList {
    /**
     * Creates a new completion list.
     *
     * @param items The completion items.
     * @param isIncomplete The list is not complete.
     */
    function create(items?: CompletionItem[], isIncomplete?: boolean): CompletionList;
}
/**
 * MarkedString can be used to render human readable text. It is either a markdown string
 * or a code-block that provides a language and a code snippet. The language identifier
 * is semantically equal to the optional language identifier in fenced code blocks in GitHub
 * issues. See https://help.github.com/articles/creating-and-highlighting-code-blocks/#syntax-highlighting
 *
 * The pair of a language and a value is an equivalent to markdown:
 * ```${language}
 * ${value}
 * ```
 *
 * Note that markdown strings will be sanitized - that means html will be escaped.
 * @deprecated use MarkupContent instead.
 */
export declare type MarkedString = string | {
    language: string;
    value: string;
};
export declare namespace MarkedString {
    /**
     * Creates a marked string from plain text.
     *
     * @param plainText The plain text.
     */
    function fromPlainText(plainText: string): string;
    /**
     * Checks whether the given value conforms to the [MarkedString](#MarkedString) type.
     */
    function is(value: any): value is MarkedString;
}
/**
 * The result of a hover request.
 */
export interface Hover {
    /**
     * The hover's content
     */
    contents: MarkupContent | MarkedString | MarkedString[];
    /**
     * An optional range
     */
    range?: Range;
}
export declare namespace Hover {
    /**
     * Checks whether the given value conforms to the [Hover](#Hover) interface.
     */
    function is(value: any): value is Hover;
}
/**
 * Represents a parameter of a callable-signature. A parameter can
 * have a label and a doc-comment.
 */
export interface ParameterInformation {
    /**
     * The label of this parameter information.
     *
     * Either a string or an inclusive start and exclusive end offsets within its containing
     * signature label. (see SignatureInformation.label). The offsets are based on a UTF-16
     * string representation as `Position` and `Range` does.
     *
     * *Note*: a label of type string should be a substring of its containing signature label.
     * Its intended use case is to highlight the parameter label part in the `SignatureInformation.label`.
     */
    label: string | [uinteger, uinteger];
    /**
     * The human-readable doc-comment of this signature. Will be shown
     * in the UI but can be omitted.
     */
    documentation?: string | MarkupContent;
}
/**
 * The ParameterInformation namespace provides helper functions to work with
 * [ParameterInformation](#ParameterInformation) literals.
 */
export declare namespace ParameterInformation {
    /**
     * Creates a new parameter information literal.
     *
     * @param label A label string.
     * @param documentation A doc string.
     */
    function create(label: string | [uinteger, uinteger], documentation?: string): ParameterInformation;
}
/**
 * Represents the signature of something callable. A signature
 * can have a label, like a function-name, a doc-comment, and
 * a set of parameters.
 */
export interface SignatureInformation {
    /**
     * The label of this signature. Will be shown in
     * the UI.
     */
    label: string;
    /**
     * The human-readable doc-comment of this signature. Will be shown
     * in the UI but can be omitted.
     */
    documentation?: string | MarkupContent;
    /**
     * The parameters of this signature.
     */
    parameters?: ParameterInformation[];
    /**
     * The index of the active parameter.
     *
     * If provided, this is used in place of `SignatureHelp.activeParameter`.
     *
     * @since 3.16.0
     */
    activeParameter?: uinteger;
}
/**
 * The SignatureInformation namespace provides helper functions to work with
 * [SignatureInformation](#SignatureInformation) literals.
 */
export declare namespace SignatureInformation {
    function create(label: string, documentation?: string, ...parameters: ParameterInformation[]): SignatureInformation;
}
/**
 * Signature help represents the signature of something
 * callable. There can be multiple signature but only one
 * active and only one active parameter.
 */
export interface SignatureHelp {
    /**
     * One or more signatures.
     */
    signatures: SignatureInformation[];
    /**
     * The active signature. Set to `null` if no
     * signatures exist.
     */
    activeSignature: uinteger | null;
    /**
     * The active parameter of the active signature. Set to `null`
     * if the active signature has no parameters.
     */
    activeParameter: uinteger | null;
}
/**
 * The definition of a symbol represented as one or many [locations](#Location).
 * For most programming languages there is only one location at which a symbol is
 * defined.
 *
 * Servers should prefer returning `DefinitionLink` over `Definition` if supported
 * by the client.
 */
export declare type Definition = Location | Location[];
/**
 * Information about where a symbol is defined.
 *
 * Provides additional metadata over normal [location](#Location) definitions, including the range of
 * the defining symbol
 */
export declare type DefinitionLink = LocationLink;
/**
 * The declaration of a symbol representation as one or many [locations](#Location).
 */
export declare type Declaration = Location | Location[];
/**
 * Information about where a symbol is declared.
 *
 * Provides additional metadata over normal [location](#Location) declarations, including the range of
 * the declaring symbol.
 *
 * Servers should prefer returning `DeclarationLink` over `Declaration` if supported
 * by the client.
 */
export declare type DeclarationLink = LocationLink;
/**
 * Value-object that contains additional information when
 * requesting references.
 */
export interface ReferenceContext {
    /**
     * Include the declaration of the current symbol.
     */
    includeDeclaration: boolean;
}
/**
 * A document highlight kind.
 */
export declare namespace DocumentHighlightKind {
    /**
     * A textual occurrence.
     */
    const Text: 1;
    /**
     * Read-access of a symbol, like reading a variable.
     */
    const Read: 2;
    /**
     * Write-access of a symbol, like writing to a variable.
     */
    const Write: 3;
}
export declare type DocumentHighlightKind = 1 | 2 | 3;
/**
 * A document highlight is a range inside a text document which deserves
 * special attention. Usually a document highlight is visualized by changing
 * the background color of its range.
 */
export interface DocumentHighlight {
    /**
     * The range this highlight applies to.
     */
    range: Range;
    /**
     * The highlight kind, default is [text](#DocumentHighlightKind.Text).
     */
    kind?: DocumentHighlightKind;
}
/**
 * DocumentHighlight namespace to provide helper functions to work with
 * [DocumentHighlight](#DocumentHighlight) literals.
 */
export declare namespace DocumentHighlight {
    /**
     * Create a DocumentHighlight object.
     * @param range The range the highlight applies to.
     */
    function create(range: Range, kind?: DocumentHighlightKind): DocumentHighlight;
}
/**
 * A symbol kind.
 */
export declare namespace SymbolKind {
    const File: 1;
    const Module: 2;
    const Namespace: 3;
    const Package: 4;
    const Class: 5;
    const Method: 6;
    const Property: 7;
    const Field: 8;
    const Constructor: 9;
    const Enum: 10;
    const Interface: 11;
    const Function: 12;
    const Variable: 13;
    const Constant: 14;
    const String: 15;
    const Number: 16;
    const Boolean: 17;
    const Array: 18;
    const Object: 19;
    const Key: 20;
    const Null: 21;
    const EnumMember: 22;
    const Struct: 23;
    const Event: 24;
    const Operator: 25;
    const TypeParameter: 26;
}
export declare type SymbolKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26;
/**
 * Symbol tags are extra annotations that tweak the rendering of a symbol.
 * @since 3.16
 */
export declare namespace SymbolTag {
    /**
     * Render a symbol as obsolete, usually using a strike-out.
     */
    const Deprecated: 1;
}
export declare type SymbolTag = 1;
/**
 * Represents information about programming constructs like variables, classes,
 * interfaces etc.
 */
export interface SymbolInformation {
    /**
     * The name of this symbol.
     */
    name: string;
    /**
     * The kind of this symbol.
     */
    kind: SymbolKind;
    /**
     * Tags for this completion item.
     *
     * @since 3.16.0
     */
    tags?: SymbolTag[];
    /**
     * Indicates if this symbol is deprecated.
     *
     * @deprecated Use tags instead
     */
    deprecated?: boolean;
    /**
     * The location of this symbol. The location's range is used by a tool
     * to reveal the location in the editor. If the symbol is selected in the
     * tool the range's start information is used to position the cursor. So
     * the range usually spans more than the actual symbol's name and does
     * normally include thinks like visibility modifiers.
     *
     * The range doesn't have to denote a node range in the sense of a abstract
     * syntax tree. It can therefore not be used to re-construct a hierarchy of
     * the symbols.
     */
    location: Location;
    /**
     * The name of the symbol containing this symbol. This information is for
     * user interface purposes (e.g. to render a qualifier in the user interface
     * if necessary). It can't be used to re-infer a hierarchy for the document
     * symbols.
     */
    containerName?: string;
}
export declare namespace SymbolInformation {
    /**
     * Creates a new symbol information literal.
     *
     * @param name The name of the symbol.
     * @param kind The kind of the symbol.
     * @param range The range of the location of the symbol.
     * @param uri The resource of the location of symbol, defaults to the current document.
     * @param containerName The name of the symbol containing the symbol.
     */
    function create(name: string, kind: SymbolKind, range: Range, uri?: string, containerName?: string): SymbolInformation;
}
/**
 * Represents programming constructs like variables, classes, interfaces etc.
 * that appear in a document. Document symbols can be hierarchical and they
 * have two ranges: one that encloses its definition and one that points to
 * its most interesting range, e.g. the range of an identifier.
 */
export interface DocumentSymbol {
    /**
     * The name of this symbol. Will be displayed in the user interface and therefore must not be
     * an empty string or a string only consisting of white spaces.
     */
    name: string;
    /**
     * More detail for this symbol, e.g the signature of a function.
     */
    detail?: string;
    /**
     * The kind of this symbol.
     */
    kind: SymbolKind;
    /**
     * Tags for this completion item.
     *
     * @since 3.16.0
     */
    tags?: SymbolTag[];
    /**
     * Indicates if this symbol is deprecated.
     *
     * @deprecated Use tags instead
     */
    deprecated?: boolean;
    /**
     * The range enclosing this symbol not including leading/trailing whitespace but everything else
     * like comments. This information is typically used to determine if the the clients cursor is
     * inside the symbol to reveal in the symbol in the UI.
     */
    range: Range;
    /**
     * The range that should be selected and revealed when this symbol is being picked, e.g the name of a function.
     * Must be contained by the the `range`.
     */
    selectionRange: Range;
    /**
     * Children of this symbol, e.g. properties of a class.
     */
    children?: DocumentSymbol[];
}
export declare namespace DocumentSymbol {
    /**
     * Creates a new symbol information literal.
     *
     * @param name The name of the symbol.
     * @param detail The detail of the symbol.
     * @param kind The kind of the symbol.
     * @param range The range of the symbol.
     * @param selectionRange The selectionRange of the symbol.
     * @param children Children of the symbol.
     */
    function create(name: string, detail: string | undefined, kind: SymbolKind, range: Range, selectionRange: Range, children?: DocumentSymbol[]): DocumentSymbol;
    /**
     * Checks whether the given literal conforms to the [DocumentSymbol](#DocumentSymbol) interface.
     */
    function is(value: any): value is DocumentSymbol;
}
/**
 * The kind of a code action.
 *
 * Kinds are a hierarchical list of identifiers separated by `.`, e.g. `"refactor.extract.function"`.
 *
 * The set of kinds is open and client needs to announce the kinds it supports to the server during
 * initialization.
 */
export declare type CodeActionKind = string;
/**
 * A set of predefined code action kinds
 */
export declare namespace CodeActionKind {
    /**
     * Empty kind.
     */
    const Empty: CodeActionKind;
    /**
     * Base kind for quickfix actions: 'quickfix'
     */
    const QuickFix: CodeActionKind;
    /**
     * Base kind for refactoring actions: 'refactor'
     */
    const Refactor: CodeActionKind;
    /**
     * Base kind for refactoring extraction actions: 'refactor.extract'
     *
     * Example extract actions:
     *
     * - Extract method
     * - Extract function
     * - Extract variable
     * - Extract interface from class
     * - ...
     */
    const RefactorExtract: CodeActionKind;
    /**
     * Base kind for refactoring inline actions: 'refactor.inline'
     *
     * Example inline actions:
     *
     * - Inline function
     * - Inline variable
     * - Inline constant
     * - ...
     */
    const RefactorInline: CodeActionKind;
    /**
     * Base kind for refactoring rewrite actions: 'refactor.rewrite'
     *
     * Example rewrite actions:
     *
     * - Convert JavaScript function to class
     * - Add or remove parameter
     * - Encapsulate field
     * - Make method static
     * - Move method to base class
     * - ...
     */
    const RefactorRewrite: CodeActionKind;
    /**
     * Base kind for source actions: `source`
     *
     * Source code actions apply to the entire file.
     */
    const Source: CodeActionKind;
    /**
     * Base kind for an organize imports source action: `source.organizeImports`
     */
    const SourceOrganizeImports: CodeActionKind;
    /**
     * Base kind for auto-fix source actions: `source.fixAll`.
     *
     * Fix all actions automatically fix errors that have a clear fix that do not require user input.
     * They should not suppress errors or perform unsafe fixes such as generating new types or classes.
     *
     * @since 3.15.0
     */
    const SourceFixAll: CodeActionKind;
}
/**
 * Contains additional diagnostic information about the context in which
 * a [code action](#CodeActionProvider.provideCodeActions) is run.
 */
export interface CodeActionContext {
    /**
     * An array of diagnostics known on the client side overlapping the range provided to the
     * `textDocument/codeAction` request. They are provided so that the server knows which
     * errors are currently presented to the user for the given range. There is no guarantee
     * that these accurately reflect the error state of the resource. The primary parameter
     * to compute code actions is the provided range.
     */
    diagnostics: Diagnostic[];
    /**
     * Requested kind of actions to return.
     *
     * Actions not of this kind are filtered out by the client before being shown. So servers
     * can omit computing them.
     */
    only?: CodeActionKind[];
}
/**
 * The CodeActionContext namespace provides helper functions to work with
 * [CodeActionContext](#CodeActionContext) literals.
 */
export declare namespace CodeActionContext {
    /**
     * Creates a new CodeActionContext literal.
     */
    function create(diagnostics: Diagnostic[], only?: CodeActionKind[]): CodeActionContext;
    /**
     * Checks whether the given literal conforms to the [CodeActionContext](#CodeActionContext) interface.
     */
    function is(value: any): value is CodeActionContext;
}
/**
 * A code action represents a change that can be performed in code, e.g. to fix a problem or
 * to refactor code.
 *
 * A CodeAction must set either `edit` and/or a `command`. If both are supplied, the `edit` is applied first, then the `command` is executed.
 */
export interface CodeAction {
    /**
     * A short, human-readable, title for this code action.
     */
    title: string;
    /**
     * The kind of the code action.
     *
     * Used to filter code actions.
     */
    kind?: CodeActionKind;
    /**
     * The diagnostics that this code action resolves.
     */
    diagnostics?: Diagnostic[];
    /**
     * Marks this as a preferred action. Preferred actions are used by the `auto fix` command and can be targeted
     * by keybindings.
     *
     * A quick fix should be marked preferred if it properly addresses the underlying error.
     * A refactoring should be marked preferred if it is the most reasonable choice of actions to take.
     *
     * @since 3.15.0
     */
    isPreferred?: boolean;
    /**
     * Marks that the code action cannot currently be applied.
     *
     * Clients should follow the following guidelines regarding disabled code actions:
     *
     *   - Disabled code actions are not shown in automatic [lightbulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action)
     *     code action menu.
     *
     *   - Disabled actions are shown as faded out in the code action menu when the user request a more specific type
     *     of code action, such as refactorings.
     *
     *   - If the user has a [keybinding](https://code.visualstudio.com/docs/editor/refactoring#_keybindings-for-code-actions)
     *     that auto applies a code action and only a disabled code actions are returned, the client should show the user an
     *     error message with `reason` in the editor.
     *
     * @since 3.16.0
     */
    disabled?: {
        /**
         * Human readable description of why the code action is currently disabled.
         *
         * This is displayed in the code actions UI.
         */
        reason: string;
    };
    /**
     * The workspace edit this code action performs.
     */
    edit?: WorkspaceEdit;
    /**
     * A command this code action executes. If a code action
     * provides a edit and a command, first the edit is
     * executed and then the command.
     */
    command?: Command;
    /**
     * A data entry field that is preserved on a code action between
     * a `textDocument/codeAction` and a `codeAction/resolve` request.
     *
     * @since 3.16.0
     */
    data?: unknown;
}
export declare namespace CodeAction {
    /**
     * Creates a new code action.
     *
     * @param title The title of the code action.
     * @param kind The kind of the code action.
     */
    function create(title: string, kind?: CodeActionKind): CodeAction;
    /**
     * Creates a new code action.
     *
     * @param title The title of the code action.
     * @param command The command to execute.
     * @param kind The kind of the code action.
     */
    function create(title: string, command: Command, kind?: CodeActionKind): CodeAction;
    /**
     * Creates a new code action.
     *
     * @param title The title of the code action.
     * @param command The command to execute.
     * @param kind The kind of the code action.
     */
    function create(title: string, edit: WorkspaceEdit, kind?: CodeActionKind): CodeAction;
    function is(value: any): value is CodeAction;
}
/**
 * A code lens represents a [command](#Command) that should be shown along with
 * source text, like the number of references, a way to run tests, etc.
 *
 * A code lens is _unresolved_ when no command is associated to it. For performance
 * reasons the creation of a code lens and resolving should be done to two stages.
 */
export interface CodeLens {
    /**
     * The range in which this code lens is valid. Should only span a single line.
     */
    range: Range;
    /**
     * The command this code lens represents.
     */
    command?: Command;
    /**
     * A data entry field that is preserved on a code lens item between
     * a [CodeLensRequest](#CodeLensRequest) and a [CodeLensResolveRequest]
     * (#CodeLensResolveRequest)
     */
    data?: any;
}
/**
 * The CodeLens namespace provides helper functions to work with
 * [CodeLens](#CodeLens) literals.
 */
export declare namespace CodeLens {
    /**
     * Creates a new CodeLens literal.
     */
    function create(range: Range, data?: any): CodeLens;
    /**
     * Checks whether the given literal conforms to the [CodeLens](#CodeLens) interface.
     */
    function is(value: any): value is CodeLens;
}
/**
 * Value-object describing what options formatting should use.
 */
export interface FormattingOptions {
    /**
     * Size of a tab in spaces.
     */
    tabSize: uinteger;
    /**
     * Prefer spaces over tabs.
     */
    insertSpaces: boolean;
    /**
     * Trim trailing whitespaces on a line.
     *
     * @since 3.15.0
     */
    trimTrailingWhitespace?: boolean;
    /**
     * Insert a newline character at the end of the file if one does not exist.
     *
     * @since 3.15.0
     */
    insertFinalNewline?: boolean;
    /**
     * Trim all newlines after the final newline at the end of the file.
     *
     * @since 3.15.0
     */
    trimFinalNewlines?: boolean;
    /**
     * Signature for further properties.
     */
    [key: string]: boolean | integer | string | undefined;
}
/**
 * The FormattingOptions namespace provides helper functions to work with
 * [FormattingOptions](#FormattingOptions) literals.
 */
export declare namespace FormattingOptions {
    /**
     * Creates a new FormattingOptions literal.
     */
    function create(tabSize: uinteger, insertSpaces: boolean): FormattingOptions;
    /**
     * Checks whether the given literal conforms to the [FormattingOptions](#FormattingOptions) interface.
     */
    function is(value: any): value is FormattingOptions;
}
/**
 * A document link is a range in a text document that links to an internal or external resource, like another
 * text document or a web site.
 */
export interface DocumentLink {
    /**
     * The range this link applies to.
     */
    range: Range;
    /**
     * The uri this link points to.
     */
    target?: string;
    /**
     * The tooltip text when you hover over this link.
     *
     * If a tooltip is provided, is will be displayed in a string that includes instructions on how to
     * trigger the link, such as `{0} (ctrl + click)`. The specific instructions vary depending on OS,
     * user settings, and localization.
     *
     * @since 3.15.0
     */
    tooltip?: string;
    /**
     * A data entry field that is preserved on a document link between a
     * DocumentLinkRequest and a DocumentLinkResolveRequest.
     */
    data?: any;
}
/**
 * The DocumentLink namespace provides helper functions to work with
 * [DocumentLink](#DocumentLink) literals.
 */
export declare namespace DocumentLink {
    /**
     * Creates a new DocumentLink literal.
     */
    function create(range: Range, target?: string, data?: any): DocumentLink;
    /**
     * Checks whether the given literal conforms to the [DocumentLink](#DocumentLink) interface.
     */
    function is(value: any): value is DocumentLink;
}
/**
 * A selection range represents a part of a selection hierarchy. A selection range
 * may have a parent selection range that contains it.
 */
export interface SelectionRange {
    /**
     * The [range](#Range) of this selection range.
     */
    range: Range;
    /**
     * The parent selection range containing this range. Therefore `parent.range` must contain `this.range`.
     */
    parent?: SelectionRange;
}
/**
 * The SelectionRange namespace provides helper function to work with
 * SelectionRange literals.
 */
export declare namespace SelectionRange {
    /**
     * Creates a new SelectionRange
     * @param range the range.
     * @param parent an optional parent.
     */
    function create(range: Range, parent?: SelectionRange): SelectionRange;
    function is(value: any): value is SelectionRange;
}
/**
 * Represents programming constructs like functions or constructors in the context
 * of call hierarchy.
 *
 * @since 3.16.0
 */
export interface CallHierarchyItem {
    /**
     * The name of this item.
     */
    name: string;
    /**
     * The kind of this item.
     */
    kind: SymbolKind;
    /**
     * Tags for this item.
     */
    tags?: SymbolTag[];
    /**
     * More detail for this item, e.g. the signature of a function.
     */
    detail?: string;
    /**
     * The resource identifier of this item.
     */
    uri: DocumentUri;
    /**
     * The range enclosing this symbol not including leading/trailing whitespace but everything else, e.g. comments and code.
     */
    range: Range;
    /**
     * The range that should be selected and revealed when this symbol is being picked, e.g. the name of a function.
     * Must be contained by the [`range`](#CallHierarchyItem.range).
     */
    selectionRange: Range;
    /**
     * A data entry field that is preserved between a call hierarchy prepare and
     * incoming calls or outgoing calls requests.
     */
    data?: unknown;
}
/**
 * Represents an incoming call, e.g. a caller of a method or constructor.
 *
 * @since 3.16.0
 */
export interface CallHierarchyIncomingCall {
    /**
     * The item that makes the call.
     */
    from: CallHierarchyItem;
    /**
     * The ranges at which the calls appear. This is relative to the caller
     * denoted by [`this.from`](#CallHierarchyIncomingCall.from).
     */
    fromRanges: Range[];
}
/**
 * Represents an outgoing call, e.g. calling a getter from a method or a method from a constructor etc.
 *
 * @since 3.16.0
 */
export interface CallHierarchyOutgoingCall {
    /**
     * The item that is called.
     */
    to: CallHierarchyItem;
    /**
     * The range at which this item is called. This is the range relative to the caller, e.g the item
     * passed to [`provideCallHierarchyOutgoingCalls`](#CallHierarchyItemProvider.provideCallHierarchyOutgoingCalls)
     * and not [`this.to`](#CallHierarchyOutgoingCall.to).
     */
    fromRanges: Range[];
}
export declare const EOL: string[];
/**
 * A simple text document. Not to be implemented. The document keeps the content
 * as string.
 *
 * @deprecated Use the text document from the new vscode-languageserver-textdocument package.
 */
export interface TextDocument {
    /**
     * The associated URI for this document. Most documents have the __file__-scheme, indicating that they
     * represent files on disk. However, some documents may have other schemes indicating that they are not
     * available on disk.
     *
     * @readonly
     */
    readonly uri: DocumentUri;
    /**
     * The identifier of the language associated with this document.
     *
     * @readonly
     */
    readonly languageId: string;
    /**
     * The version number of this document (it will increase after each
     * change, including undo/redo).
     *
     * @readonly
     */
    readonly version: integer;
    /**
     * Get the text of this document. A substring can be retrieved by
     * providing a range.
     *
     * @param range (optional) An range within the document to return.
     * If no range is passed, the full content is returned.
     * Invalid range positions are adjusted as described in [Position.line](#Position.line)
     * and [Position.character](#Position.character).
     * If the start range position is greater than the end range position,
     * then the effect of getText is as if the two positions were swapped.

     * @return The text of this document or a substring of the text if a
     *         range is provided.
     */
    getText(range?: Range): string;
    /**
     * Converts a zero-based offset to a position.
     *
     * @param offset A zero-based offset.
     * @return A valid [position](#Position).
     */
    positionAt(offset: uinteger): Position;
    /**
     * Converts the position to a zero-based offset.
     * Invalid positions are adjusted as described in [Position.line](#Position.line)
     * and [Position.character](#Position.character).
     *
     * @param position A position.
     * @return A valid zero-based offset.
     */
    offsetAt(position: Position): uinteger;
    /**
     * The number of lines in this document.
     *
     * @readonly
     */
    readonly lineCount: uinteger;
}
/**
 * @deprecated Use the text document from the new vscode-languageserver-textdocument package.
 */
export declare namespace TextDocument {
    /**
     * Creates a new ITextDocument literal from the given uri and content.
     * @param uri The document's uri.
     * @param languageId  The document's language Id.
     * @param content The document's content.
     */
    function create(uri: DocumentUri, languageId: string, version: integer, content: string): TextDocument;
    /**
     * Checks whether the given literal conforms to the [ITextDocument](#ITextDocument) interface.
     */
    function is(value: any): value is TextDocument;
    function applyEdits(document: TextDocument, edits: TextEdit[]): string;
}
export {};

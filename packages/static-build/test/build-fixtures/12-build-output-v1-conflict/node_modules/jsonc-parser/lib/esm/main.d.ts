/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
export declare const createScanner: (text: string, ignoreTrivia?: boolean) => JSONScanner;
export declare const enum ScanError {
    None = 0,
    UnexpectedEndOfComment = 1,
    UnexpectedEndOfString = 2,
    UnexpectedEndOfNumber = 3,
    InvalidUnicode = 4,
    InvalidEscapeCharacter = 5,
    InvalidCharacter = 6
}
export declare const enum SyntaxKind {
    OpenBraceToken = 1,
    CloseBraceToken = 2,
    OpenBracketToken = 3,
    CloseBracketToken = 4,
    CommaToken = 5,
    ColonToken = 6,
    NullKeyword = 7,
    TrueKeyword = 8,
    FalseKeyword = 9,
    StringLiteral = 10,
    NumericLiteral = 11,
    LineCommentTrivia = 12,
    BlockCommentTrivia = 13,
    LineBreakTrivia = 14,
    Trivia = 15,
    Unknown = 16,
    EOF = 17
}
/**
 * The scanner object, representing a JSON scanner at a position in the input string.
 */
export interface JSONScanner {
    /**
     * Sets the scan position to a new offset. A call to 'scan' is needed to get the first token.
     */
    setPosition(pos: number): void;
    /**
     * Read the next token. Returns the token code.
     */
    scan(): SyntaxKind;
    /**
     * Returns the current scan position, which is after the last read token.
     */
    getPosition(): number;
    /**
     * Returns the last read token.
     */
    getToken(): SyntaxKind;
    /**
     * Returns the last read token value. The value for strings is the decoded string content. For numbers it's of type number, for boolean it's true or false.
     */
    getTokenValue(): string;
    /**
     * The start offset of the last read token.
     */
    getTokenOffset(): number;
    /**
     * The length of the last read token.
     */
    getTokenLength(): number;
    /**
     * The zero-based start line number of the last read token.
     */
    getTokenStartLine(): number;
    /**
     * The zero-based start character (column) of the last read token.
     */
    getTokenStartCharacter(): number;
    /**
     * An error code of the last scan.
     */
    getTokenError(): ScanError;
}
/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
export declare const getLocation: (text: string, position: number) => Location;
/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore, always check the errors list to find out if the input was valid.
 */
export declare const parse: (text: string, errors?: ParseError[], options?: ParseOptions) => any;
/**
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
export declare const parseTree: (text: string, errors?: ParseError[], options?: ParseOptions) => Node | undefined;
/**
 * Finds the node at the given path in a JSON DOM.
 */
export declare const findNodeAtLocation: (root: Node, path: JSONPath) => Node | undefined;
/**
 * Finds the innermost node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
export declare const findNodeAtOffset: (root: Node, offset: number, includeRightBound?: boolean) => Node | undefined;
/**
 * Gets the JSON path of the given JSON DOM node
 */
export declare const getNodePath: (node: Node) => JSONPath;
/**
 * Evaluates the JavaScript object of the given JSON DOM node
 */
export declare const getNodeValue: (node: Node) => any;
/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export declare const visit: (text: string, visitor: JSONVisitor, options?: ParseOptions) => any;
/**
 * Takes JSON with JavaScript-style comments and remove
 * them. Optionally replaces every none-newline character
 * of comments with a replaceCharacter
 */
export declare const stripComments: (text: string, replaceCh?: string) => string;
export interface ParseError {
    error: ParseErrorCode;
    offset: number;
    length: number;
}
export declare const enum ParseErrorCode {
    InvalidSymbol = 1,
    InvalidNumberFormat = 2,
    PropertyNameExpected = 3,
    ValueExpected = 4,
    ColonExpected = 5,
    CommaExpected = 6,
    CloseBraceExpected = 7,
    CloseBracketExpected = 8,
    EndOfFileExpected = 9,
    InvalidCommentToken = 10,
    UnexpectedEndOfComment = 11,
    UnexpectedEndOfString = 12,
    UnexpectedEndOfNumber = 13,
    InvalidUnicode = 14,
    InvalidEscapeCharacter = 15,
    InvalidCharacter = 16
}
export declare function printParseErrorCode(code: ParseErrorCode): "InvalidSymbol" | "InvalidNumberFormat" | "PropertyNameExpected" | "ValueExpected" | "ColonExpected" | "CommaExpected" | "CloseBraceExpected" | "CloseBracketExpected" | "EndOfFileExpected" | "InvalidCommentToken" | "UnexpectedEndOfComment" | "UnexpectedEndOfString" | "UnexpectedEndOfNumber" | "InvalidUnicode" | "InvalidEscapeCharacter" | "InvalidCharacter" | "<unknown ParseErrorCode>";
export declare type NodeType = 'object' | 'array' | 'property' | 'string' | 'number' | 'boolean' | 'null';
export interface Node {
    readonly type: NodeType;
    readonly value?: any;
    readonly offset: number;
    readonly length: number;
    readonly colonOffset?: number;
    readonly parent?: Node;
    readonly children?: Node[];
}
export declare type Segment = string | number;
export declare type JSONPath = Segment[];
export interface Location {
    /**
     * The previous property key or literal value (string, number, boolean or null) or undefined.
     */
    previousNode?: Node;
    /**
     * The path describing the location in the JSON document. The path consists of a sequence of strings
     * representing an object property or numbers for array indices.
     */
    path: JSONPath;
    /**
     * Matches the locations path against a pattern consisting of strings (for properties) and numbers (for array indices).
     * '*' will match a single segment of any property name or index.
     * '**' will match a sequence of segments of any property name or index, or no segment.
     */
    matches: (patterns: JSONPath) => boolean;
    /**
     * If set, the location's offset is at a property key.
     */
    isAtPropertyKey: boolean;
}
export interface ParseOptions {
    disallowComments?: boolean;
    allowTrailingComma?: boolean;
    allowEmptyContent?: boolean;
}
export interface JSONVisitor {
    /**
     * Invoked when an open brace is encountered and an object is started. The offset and length represent the location of the open brace.
     */
    onObjectBegin?: (offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked when a property is encountered. The offset and length represent the location of the property name.
     */
    onObjectProperty?: (property: string, offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked when a closing brace is encountered and an object is completed. The offset and length represent the location of the closing brace.
     */
    onObjectEnd?: (offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked when an open bracket is encountered. The offset and length represent the location of the open bracket.
     */
    onArrayBegin?: (offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked when a closing bracket is encountered. The offset and length represent the location of the closing bracket.
     */
    onArrayEnd?: (offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked when a literal value is encountered. The offset and length represent the location of the literal value.
     */
    onLiteralValue?: (value: any, offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked when a comma or colon separator is encountered. The offset and length represent the location of the separator.
     */
    onSeparator?: (character: string, offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * When comments are allowed, invoked when a line or block comment is encountered. The offset and length represent the location of the comment.
     */
    onComment?: (offset: number, length: number, startLine: number, startCharacter: number) => void;
    /**
     * Invoked on an error.
     */
    onError?: (error: ParseErrorCode, offset: number, length: number, startLine: number, startCharacter: number) => void;
}
/**
 * Represents a text modification
 */
export interface Edit {
    /**
     * The start offset of the modification.
     */
    offset: number;
    /**
     * The length of the modification. Must not be negative. Empty length represents an *insert*.
     */
    length: number;
    /**
     * The new content. Empty content represents a *remove*.
     */
    content: string;
}
/**
 * A text range in the document
*/
export interface Range {
    /**
     * The start offset of the range.
     */
    offset: number;
    /**
     * The length of the range. Must not be negative.
     */
    length: number;
}
export interface FormattingOptions {
    /**
     * If indentation is based on spaces (`insertSpaces` = true), the number of spaces that make an indent.
     */
    tabSize?: number;
    /**
     * Is indentation based on spaces?
     */
    insertSpaces?: boolean;
    /**
     * The default 'end of line' character. If not set, '\n' is used as default.
     */
    eol?: string;
    /**
     * If set, will add a new line at the end of the document.
     */
    insertFinalNewline?: boolean;
}
/**
 * Computes the edits needed to format a JSON document.
 *
 * @param documentText The input text
 * @param range The range to format or `undefined` to format the full content
 * @param options The formatting options
 * @returns A list of edit operations describing the formatting changes to the original document. Edits can be either inserts, replacements or
 * removals of text segments. All offsets refer to the original state of the document. No two edits must change or remove the same range of
 * text in the original document. However, multiple edits can have
 * the same offset, for example multiple inserts, or an insert followed by a remove or replace. The order in the array defines which edit is applied first.
 * To apply edits to an input, you can use `applyEdits`.
 */
export declare function format(documentText: string, range: Range | undefined, options: FormattingOptions): Edit[];
/**
 * Options used when computing the modification edits
 */
export interface ModificationOptions {
    /**
     * Formatting options. If undefined, the newly inserted code will be inserted unformatted.
    */
    formattingOptions?: FormattingOptions;
    /**
     * Default false. If `JSONPath` refers to an index of an array and {@property isArrayInsertion} is `true`, then
     * {@function modify} will insert a new item at that location instead of overwriting its contents.
     */
    isArrayInsertion?: boolean;
    /**
     * Optional function to define the insertion index given an existing list of properties.
     */
    getInsertionIndex?: (properties: string[]) => number;
}
/**
 * Computes the edits needed to modify a value in the JSON document.
 *
 * @param documentText The input text
 * @param path The path of the value to change. The path represents either to the document root, a property or an array item.
 * If the path points to an non-existing property or item, it will be created.
 * @param value The new value for the specified property or item. If the value is undefined,
 * the property or item will be removed.
 * @param options Options
 * @returns A list of edit operations describing the formatting changes to the original document. Edits can be either inserts, replacements or
 * removals of text segments. All offsets refer to the original state of the document. No two edits must change or remove the same range of
 * text in the original document. However, multiple edits can have
 * the same offset, for example multiple inserts, or an insert followed by a remove or replace. The order in the array defines which edit is applied first.
 * To apply edits to an input, you can use `applyEdits`.
 */
export declare function modify(text: string, path: JSONPath, value: any, options: ModificationOptions): Edit[];
/**
 * Applies edits to a input string.
 */
export declare function applyEdits(text: string, edits: Edit[]): string;

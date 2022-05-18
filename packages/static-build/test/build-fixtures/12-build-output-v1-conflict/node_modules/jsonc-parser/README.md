# jsonc-parser
Scanner and parser for JSON with comments.

[![npm Package](https://img.shields.io/npm/v/jsonc-parser.svg?style=flat-square)](https://www.npmjs.org/package/jsonc-parser)
[![NPM Downloads](https://img.shields.io/npm/dm/jsonc-parser.svg)](https://npmjs.org/package/jsonc-parser)
[![Build Status](https://travis-ci.org/Microsoft/node-jsonc-parser.svg?branch=master)](https://travis-ci.org/Microsoft/node-jsonc-parser)

Why?
----
JSONC is JSON with JavaScript style comments. This node module provides a scanner and fault tolerant parser that can process JSONC but is also useful for standard JSON.
 - the *scanner* tokenizes the input string into tokens and token offsets
 - the *visit* function implements a 'SAX' style parser with callbacks for the encountered properties and values.
 - the *parseTree* function computes a hierarchical DOM with offsets representing the encountered properties and values.
 - the *parse* function evaluates the JavaScript object represented by JSON string in a fault tolerant fashion. 
 - the *getLocation* API returns a location object that describes the property or value located at a given offset in a JSON document.
 - the *findNodeAtLocation* API finds the node at a given location path in a JSON DOM.
 - the *format* API computes edits to format a JSON document.
 - the *modify* API computes edits to insert, remove or replace a property or value in a JSON document.
 - the *applyEdits* API applies edits to a document.

Installation
------------

    npm install --save jsonc-parser
    
    
API
---

### Scanner:
```typescript

/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
export function createScanner(text:string, ignoreTrivia:boolean = false):JSONScanner;
    
/**
 * The scanner object, representing a JSON scanner at a position in the input string.
 */
export interface JSONScanner {
    /**
     * Sets the scan position to a new offset. A call to 'scan' is needed to get the first token.
     */
    setPosition(pos: number): any;
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
     * Returns the last read token value. The value for strings is the decoded string content. For numbers its of type number, for boolean it's true or false.
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
```

### Parser:
```typescript

export interface ParseOptions {
    disallowComments?: boolean;
}
/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
export declare function parse(text: string, errors?: {error: ParseErrorCode;}[], options?: ParseOptions): any;

/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export declare function visit(text: string, visitor: JSONVisitor, options?: ParseOptions): any;

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
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
export declare function parseTree(text: string, errors?: ParseError[], options?: ParseOptions): Node | undefined;

export declare type NodeType = "object" | "array" | "property" | "string" | "number" | "boolean" | "null";
export interface Node {
    type: NodeType;
    value?: any;
    offset: number;
    length: number;
    colonOffset?: number;
    parent?: Node;
    children?: Node[];
}

```

### Utilities:
```typescript
/**
 * Takes JSON with JavaScript-style comments and remove
 * them. Optionally replaces every none-newline character
 * of comments with a replaceCharacter
 */
export declare function stripComments(text: string, replaceCh?: string): string;

/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
export declare function getLocation(text: string, position: number): Location;

export declare type Segment = string | number;
export interface Location {
    /**
     * The previous property key or literal value (string, number, boolean or null) or undefined.
     */
    previousNode?: Node;
    /**
     * The path describing the location in the JSON document. The path consists of a sequence strings
     * representing an object property or numbers for array indices.
     */
    path: Segment[];
    /**
     * Matches the locations path against a pattern consisting of strings (for properties) and numbers (for array indices).
     * '*' will match a single segment, of any property name or index.
     * '**' will match a sequece of segments or no segment, of any property name or index.
     */
    matches: (patterns: Segment[]) => boolean;
    /**
     * If set, the location's offset is at a property key.
     */
    isAtPropertyKey: boolean;
}

/**
 * Finds the node at the given path in a JSON DOM.
 */
export function findNodeAtLocation(root: Node, path: JSONPath): Node | undefined;

/**
 * Finds the most inner node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
export function findNodeAtOffset(root: Node, offset: number, includeRightBound?: boolean) : Node | undefined;

/**
 * Gets the JSON path of the given JSON DOM node
 */
export function getNodePath(node: Node) : JSONPath;

/**
 * Evaluates the JavaScript object of the given JSON DOM node 
 */
export function getNodeValue(node: Node): any;

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
 * To apply edits to an input, you can use `applyEdits`
 */
export function format(documentText: string, range: Range, options: FormattingOptions): Edit[];


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
 * To apply edits to an input, you can use `applyEdits`
 */
export function modify(text: string, path: JSONPath, value: any, options: ModificationOptions): Edit[];

/**
 * Applies edits to a input string.
 */
export function applyEdits(text: string, edits: Edit[]): string;

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
	 * If indentation is based on spaces (`insertSpaces` = true), then what is the number of spaces that make an indent?
	 */
	tabSize: number;
	/**
	 * Is indentation based on spaces?
	 */
	insertSpaces: boolean;
	/**
	 * The default 'end of line' character
	 */
	eol: string;
}

```


License
-------

(MIT License)

Copyright 2018, Microsoft

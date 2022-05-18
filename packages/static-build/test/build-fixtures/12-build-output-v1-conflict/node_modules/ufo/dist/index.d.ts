/**
 * Encode characters that need to be encoded on the path, search and hash
 * sections of the URL.
 *
 * @internal
 * @param text - string to encode
 * @returns encoded string
 */
declare function encode(text: string | number): string;
/**
 * Encode characters that need to be encoded on the hash section of the URL.
 *
 * @param text - string to encode
 * @returns encoded string
 */
declare function encodeHash(text: string): string;
/**
 * Encode characters that need to be encoded query values on the query
 * section of the URL.
 *
 * @param text - string to encode
 * @returns encoded string
 */
declare function encodeQueryValue(text: string | number): string;
/**
 * Like `encodeQueryValue` but also encodes the `=` character.
 *
 * @param text - string to encode
 */
declare function encodeQueryKey(text: string | number): string;
/**
 * Encode characters that need to be encoded on the path section of the URL.
 *
 * @param text - string to encode
 * @returns encoded string
 */
declare function encodePath(text: string | number): string;
/**
 * Encode characters that need to be encoded on the path section of the URL as a
 * param. This function encodes everything {@link encodePath} does plus the
 * slash (`/`) character.
 *
 * @param text - string to encode
 * @returns encoded string
 */
declare function encodeParam(text: string | number): string;
/**
 * Decode text using `decodeURIComponent`. Returns the original text if it
 * fails.
 *
 * @param text - string to decode
 * @returns decoded string
 */
declare function decode(text?: string | number): string;
/**
 * Decode path section of URL (consitant with encodePath for slash encoding).
 *
 * @param text - string to decode
 * @returns decoded string
 */
declare function decodePath(text: string): string;
/**
 * Decode query value (consitant with encodeQueryValue for plus encoding).
 *
 * @param text - string to decode
 * @returns decoded string
 */
declare function decodeQueryValue(text: string): string;
declare function encodeHost(name?: string): string;

interface ParsedURL {
    protocol?: string;
    host?: string;
    auth?: string;
    pathname: string;
    hash: string;
    search: string;
}
interface ParsedAuth {
    username: string;
    password: string;
}
interface ParsedHost {
    hostname: string;
    port: string;
}
declare function parseURL(input?: string, defaultProto?: string): ParsedURL;
declare function parsePath(input?: string): ParsedURL;
declare function parseAuth(input?: string): ParsedAuth;
declare function parseHost(input?: string): ParsedHost;
declare function stringifyParsedURL(parsed: ParsedURL): string;

declare type QueryValue = string | string[] | undefined;
declare type QueryObject = Record<string, QueryValue>;
declare function parseQuery(paramsStr?: string): QueryObject;
declare function encodeQueryItem(key: string, val: QueryValue): string;
declare function stringifyQuery(query: QueryObject): string;

declare class $URL implements URL {
    protocol: string;
    host: string;
    auth: string;
    pathname: string;
    query: QueryObject;
    hash: string;
    constructor(input?: string);
    get hostname(): string;
    get port(): string;
    get username(): string;
    get password(): string;
    get hasProtocol(): number;
    get isAbsolute(): number | boolean;
    get search(): string;
    get searchParams(): URLSearchParams;
    get origin(): string;
    get fullpath(): string;
    get encodedAuth(): string;
    get href(): string;
    append(url: $URL): void;
    toJSON(): string;
    toString(): string;
}

declare function isRelative(inputStr: string): boolean;
declare function hasProtocol(inputStr: string, acceptProtocolRelative?: boolean): boolean;
declare function hasTrailingSlash(input?: string, queryParams?: boolean): boolean;
declare function withoutTrailingSlash(input?: string, queryParams?: boolean): string;
declare function withTrailingSlash(input?: string, queryParams?: boolean): string;
declare function hasLeadingSlash(input?: string): boolean;
declare function withoutLeadingSlash(input?: string): string;
declare function withLeadingSlash(input?: string): string;
declare function cleanDoubleSlashes(input?: string): string;
declare function withBase(input: string, base: string): string;
declare function withoutBase(input: string, base: string): string;
declare function withQuery(input: string, query: QueryObject): string;
declare function getQuery(input: string): QueryObject;
declare function isEmptyURL(url: string): boolean;
declare function isNonEmptyURL(url: string): boolean;
declare function joinURL(base: string, ...input: string[]): string;
declare function withHttp(input: string): string;
declare function withHttps(input: string): string;
declare function withoutProtocol(input: string): string;
declare function withProtocol(input: string, protocol: string): string;
declare function createURL(input: string): $URL;
declare function normalizeURL(input: string): string;
declare function resolveURL(base: string, ...input: string[]): string;
declare function isSamePath(p1: string, p2: string): boolean;
interface CompareURLOptions {
    trailingSlash?: boolean;
    leadingSlash?: boolean;
    encoding?: boolean;
}
declare function isEqual(a: string, b: string, opts?: CompareURLOptions): boolean;

export { $URL, ParsedAuth, ParsedHost, ParsedURL, QueryObject, QueryValue, cleanDoubleSlashes, createURL, decode, decodePath, decodeQueryValue, encode, encodeHash, encodeHost, encodeParam, encodePath, encodeQueryItem, encodeQueryKey, encodeQueryValue, getQuery, hasLeadingSlash, hasProtocol, hasTrailingSlash, isEmptyURL, isEqual, isNonEmptyURL, isRelative, isSamePath, joinURL, normalizeURL, parseAuth, parseHost, parsePath, parseQuery, parseURL, resolveURL, stringifyParsedURL, stringifyQuery, withBase, withHttp, withHttps, withLeadingSlash, withProtocol, withQuery, withTrailingSlash, withoutBase, withoutLeadingSlash, withoutProtocol, withoutTrailingSlash };

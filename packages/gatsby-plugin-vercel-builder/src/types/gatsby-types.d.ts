// copied from 'gatsby/dist/redux/types'

import { ASTNode } from './ast';

declare type SystemPath = string;
declare type Identifier = string;
declare type PageMode = 'SSG' | 'DSG' | 'SSR';
type TrailingSlash = 'always' | 'never' | 'ignore' | 'legacy';

interface IGraphQLTypegenOptions {
  typesOutputPath: string;
  generateOnBuild: boolean;
}

export interface IRedirect {
  fromPath: string;
  toPath: string;
  isPermanent?: boolean;
  redirectInBrowser?: boolean;
  ignoreCase: boolean;
  [key: string]: any;
}

export interface IGatsbyPage {
  internalComponentName: string;
  path: string;
  matchPath: undefined | string;
  component: SystemPath;
  componentChunkName: string;
  isCreatedByStatefulCreatePages: boolean;
  context: Record<string, unknown>;
  updatedAt: number;
  pluginCreator___NODE: Identifier;
  pluginCreatorId: Identifier;
  componentPath: SystemPath;
  ownerNodeId: Identifier;
  manifestId?: string;
  defer?: boolean;
  /**
   * INTERNAL. Do not use `page.mode`, it can be removed at any time
   * `page.mode` is currently reliable only in engines and `onPostBuild` hook
   * (in develop it is dynamic and can change at any time)
   * TODO: remove, see comments in utils/page-mode:materializePageMode
   *
   * @internal
   */
  mode: PageMode;
}

export interface IGatsbyFunction {
  /** The route in the browser to access the function **/
  functionRoute: string;
  /** The absolute path to the original function **/
  originalAbsoluteFilePath: string;
  /** The relative path to the original function **/
  originalRelativeFilePath: string;
  /** The relative path to the compiled function (always ends with .js) **/
  relativeCompiledFilePath: string;
  /** The absolute path to the compiled function (doesn't transfer across machines) **/
  absoluteCompiledFilePath: string;
  /** The matchPath regex created by path-to-regexp. Only created if the function is dynamic. **/
  matchPath: string | undefined;
  /** The plugin that owns this function route **/
  pluginName: string;
}

export interface IGatsbyConfig {
  plugins?: Array<{
    resolve: string;
    options: {
      [key: string]: unknown;
    };
  }>;
  siteMetadata?: {
    title?: string;
    author?: string;
    description?: string;
    siteUrl?: string;
    [key: string]: unknown;
  };
  polyfill?: boolean;
  developMiddleware?: any;
  proxy?: any;
  partytownProxiedURLs?: Array<string>;
  pathPrefix?: string;
  assetPrefix?: string;
  mapping?: Record<string, string>;
  jsxRuntime?: 'classic' | 'automatic';
  jsxImportSource?: string;
  trailingSlash?: TrailingSlash;
  graphqlTypegen?: IGraphQLTypegenOptions;
}

//////////////////// graphql

// Conveniently represents flow's "Maybe" type https://flow.org/en/docs/types/maybe/
type Maybe<T> = null | undefined | T;

/**
 * A representation of source input to GraphQL. The `name` and `locationOffset` parameters are
 * optional, but they are useful for clients who store GraphQL documents in source files.
 * For example, if the GraphQL input starts at line 40 in a file named `Foo.graphql`, it might
 * be useful for `name` to be `"Foo.graphql"` and location to be `{ line: 40, column: 1 }`.
 * The `line` and `column` properties in `locationOffset` are 1-indexed.
 */
declare class Source {
  body: string;
  name: string;
  locationOffset: Location;
  constructor(body: string, name?: string, locationOffset?: Location);
}

/**
 * Represents a location in a Source.
 */
interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

/**
 * Custom extensions
 *
 * @remarks
 * Use a unique identifier name for your extension, for example the name of
 * your library or project. Do not use a shortened identifier as this increases
 * the risk of conflicts. We recommend you add at most one extension field,
 * an object which can contain all the values you need.
 */
interface GraphQLErrorExtensions {
  [attributeName: string]: any;
}

/**
 * A GraphQLError describes an Error found during the parse, validate, or
 * execute phases of performing a GraphQL operation. In addition to a message
 * and stack trace, it also includes information about the locations in a
 * GraphQL document and/or execution result that correspond to the Error.
 */
declare class GraphQLError extends Error {
  constructor(
    message: string,
    nodes?: Maybe<ReadonlyArray<ASTNode> | ASTNode>,
    source?: Maybe<Source>,
    positions?: Maybe<ReadonlyArray<number>>,
    path?: Maybe<ReadonlyArray<string | number>>,
    originalError?: Maybe<Error>,
    extensions?: Maybe<GraphQLErrorExtensions>
  );

  /**
   * An array of { line, column } locations within the source GraphQL document
   * which correspond to this error.
   *
   * Errors during validation often contain multiple locations, for example to
   * point out two things with the same name. Errors during execution include a
   * single location, the field which produced the error.
   *
   * Enumerable, and appears in the result of JSON.stringify().
   */
  readonly locations: ReadonlyArray<SourceLocation> | undefined;

  /**
   * An array describing the JSON-path into the execution response which
   * corresponds to this error. Only included for errors during execution.
   *
   * Enumerable, and appears in the result of JSON.stringify().
   */
  readonly path: ReadonlyArray<string | number> | undefined;

  /**
   * An array of GraphQL AST Nodes corresponding to this error.
   */
  readonly nodes: ReadonlyArray<ASTNode> | undefined;

  /**
   * The source GraphQL document corresponding to this error.
   *
   * Note that if this Error represents more than one node, the source may not
   * represent nodes after the first node.
   */
  readonly source: Source | undefined;

  /**
   * An array of character offsets within the source GraphQL document
   * which correspond to this error.
   */
  readonly positions: ReadonlyArray<number> | undefined;

  /**
   * The original error thrown from a field resolver during execution.
   */
  readonly originalError: Error | undefined | null;

  /**
   * Extension fields to add to the formatted error.
   */
  readonly extensions: { [key: string]: any };
}

/**
 * The result of GraphQL execution.
 *
 *   - `errors` is included when any errors occurred as a non-empty array.
 *   - `data` is the result of a successful execution of the query.
 *   - `extensions` is reserved for adding non-standard properties.
 */
export interface ExecutionResult<
  TData = { [key: string]: any },
  TExtensions = { [key: string]: any }
> {
  errors?: ReadonlyArray<GraphQLError>;
  // TS_SPECIFIC: TData. Motivation: https://github.com/graphql/graphql-js/pull/2490#issuecomment-639154229
  data?: TData | null;
  extensions?: TExtensions;
}

interface IGraphQLTelemetryRecord {
  name: string;
  duration: number;
}

/**
 * SpanContext represents Span state that must propagate to descendant Spans
 * and across process boundaries.
 *
 * SpanContext is logically divided into two pieces: the user-level "Baggage"
 * (see setBaggageItem and getBaggageItem) that propagates across Span
 * boundaries and any Tracer-implementation-specific fields that are needed to
 * identify or otherwise contextualize the associated Span instance (e.g., a
 * <trace_id, span_id, sampled> tuple).
 */
declare class SpanContext {
  // The SpanContext is entirely implementation dependent

  /**
   * Returns a string representation of the implementation internal trace ID.
   *
   * @returns {string}
   */
  toTraceId(): string;

  /**
   * Returns a string representation of the implementation internal span ID.
   *
   * @returns {string}
   */
  toSpanId(): string;
}

declare class Reference {
  protected _type: string;
  protected _referencedContext: SpanContext;
  /**
   * @return {string} The Reference type (e.g., REFERENCE_CHILD_OF or
   *         REFERENCE_FOLLOWS_FROM).
   */
  type(): string;
  /**
   * @return {SpanContext} The SpanContext being referred to (e.g., the
   *         parent in a REFERENCE_CHILD_OF Reference).
   */
  referencedContext(): SpanContext;
  /**
   * Initialize a new Reference instance.
   *
   * @param {string} type - the Reference type constant (e.g.,
   *        REFERENCE_CHILD_OF or REFERENCE_FOLLOWS_FROM).
   * @param {SpanContext} referencedContext - the SpanContext being referred
   *        to. As a convenience, a Span instance may be passed in instead
   *        (in which case its .context() is used here).
   */
  constructor(type: string, referencedContext: SpanContext | Span);
}

interface SpanOptions {
  /**
   * a parent SpanContext (or Span, for convenience) that the newly-started
   * span will be the child of (per REFERENCE_CHILD_OF). If specified,
   * `references` must be unspecified.
   */
  childOf?: Span | SpanContext;
  /**
   * an array of Reference instances, each pointing to a causal parent
   * SpanContext. If specified, `fields.childOf` must be unspecified.
   */
  references?: Reference[];
  /**
   * set of key-value pairs which will be set as tags on the newly created
   * Span. Ownership of the object is passed to the created span for
   * efficiency reasons (the caller should not modify this object after
   * calling startSpan).
   */
  tags?: {
    [key: string]: any;
  };
  /**
   * a manually specified start time for the created Span object. The time
   * should be specified in milliseconds as Unix timestamp. Decimal value are
   * supported to represent time values with sub-millisecond accuracy.
   */
  startTime?: number;
}

/**
 * Tracer is the entry-point between the instrumentation API and the tracing
 * implementation.
 *
 * The default object acts as a no-op implementation.
 *
 * Note to implementators: derived classes can choose to directly implement the
 * methods in the "OpenTracing API methods" section, or optionally the subset of
 * underscore-prefixed methods to pick up the argument checking and handling
 * automatically from the base class.
 */
export declare class Tracer {
  /**
   * Starts and returns a new Span representing a logical unit of work.
   *
   * For example:
   *
   *     // Start a new (parentless) root Span:
   *     var parent = Tracer.startSpan('DoWork');
   *
   *     // Start a new (child) Span:
   *     var child = Tracer.startSpan('load-from-db', {
   *         childOf: parent.context(),
   *     });
   *
   *     // Start a new async (FollowsFrom) Span:
   *     var child = Tracer.startSpan('async-cache-write', {
   *         references: [
   *             opentracing.followsFrom(parent.context())
   *         ],
   *     });
   *
   * @param {string} name - the name of the operation (REQUIRED).
   * @param {SpanOptions} [options] - options for the newly created span.
   * @return {Span} - a new Span object.
   */
  startSpan(name: string, options?: SpanOptions): Span;
  /**
   * Injects the given SpanContext instance for cross-process propagation
   * within `carrier`. The expected type of `carrier` depends on the value of
   * `format.
   *
   * OpenTracing defines a common set of `format` values (see
   * FORMAT_TEXT_MAP, FORMAT_HTTP_HEADERS, and FORMAT_BINARY), and each has
   * an expected carrier type.
   *
   * Consider this pseudocode example:
   *
   *     var clientSpan = ...;
   *     ...
   *     // Inject clientSpan into a text carrier.
   *     var headersCarrier = {};
   *     Tracer.inject(clientSpan.context(), Tracer.FORMAT_HTTP_HEADERS, headersCarrier);
   *     // Incorporate the textCarrier into the outbound HTTP request header
   *     // map.
   *     Object.assign(outboundHTTPReq.headers, headersCarrier);
   *     // ... send the httpReq
   *
   * @param  {SpanContext} spanContext - the SpanContext to inject into the
   *         carrier object. As a convenience, a Span instance may be passed
   *         in instead (in which case its .context() is used for the
   *         inject()).
   * @param  {string} format - the format of the carrier.
   * @param  {any} carrier - see the documentation for the chosen `format`
   *         for a description of the carrier object.
   */
  inject(spanContext: SpanContext | Span, format: string, carrier: any): void;
  /**
   * Returns a SpanContext instance extracted from `carrier` in the given
   * `format`.
   *
   * OpenTracing defines a common set of `format` values (see
   * FORMAT_TEXT_MAP, FORMAT_HTTP_HEADERS, and FORMAT_BINARY), and each has
   * an expected carrier type.
   *
   * Consider this pseudocode example:
   *
   *     // Use the inbound HTTP request's headers as a text map carrier.
   *     var headersCarrier = inboundHTTPReq.headers;
   *     var wireCtx = Tracer.extract(Tracer.FORMAT_HTTP_HEADERS, headersCarrier);
   *     var serverSpan = Tracer.startSpan('...', { childOf : wireCtx });
   *
   * @param  {string} format - the format of the carrier.
   * @param  {any} carrier - the type of the carrier object is determined by
   *         the format.
   * @return {SpanContext}
   *         The extracted SpanContext, or null if no such SpanContext could
   *         be found in `carrier`
   */
  extract(format: string, carrier: any): SpanContext | null;
  protected _startSpan(name: string, fields: SpanOptions): Span;
  protected _inject(
    spanContext: SpanContext,
    format: string,
    carrier: any
  ): void;
  protected _extract(format: string, carrier: any): SpanContext | null;
}

declare class Span {
  /**
   * Returns the SpanContext object associated with this Span.
   *
   * @return {SpanContext}
   */
  context(): SpanContext;
  /**
   * Returns the Tracer object used to create this Span.
   *
   * @return {Tracer}
   */
  tracer(): Tracer;
  /**
   * Sets the string name for the logical operation this span represents.
   *
   * @param {string} name
   */
  setOperationName(name: string): this;
  /**
   * Sets a key:value pair on this Span that also propagates to future
   * children of the associated Span.
   *
   * setBaggageItem() enables powerful functionality given a full-stack
   * opentracing integration (e.g., arbitrary application data from a web
   * client can make it, transparently, all the way into the depths of a
   * storage system), and with it some powerful costs: use this feature with
   * care.
   *
   * IMPORTANT NOTE #1: setBaggageItem() will only propagate baggage items to
   * *future* causal descendants of the associated Span.
   *
   * IMPORTANT NOTE #2: Use this thoughtfully and with care. Every key and
   * value is copied into every local *and remote* child of the associated
   * Span, and that can add up to a lot of network and cpu overhead.
   *
   * @param {string} key
   * @param {string} value
   */
  setBaggageItem(key: string, value: string): this;
  /**
   * Returns the value for a baggage item given its key.
   *
   * @param  {string} key
   *         The key for the given trace attribute.
   * @return {string}
   *         String value for the given key, or undefined if the key does not
   *         correspond to a set trace attribute.
   */
  getBaggageItem(key: string): string | undefined;
  /**
   * Adds a single tag to the span.  See `addTags()` for details.
   *
   * @param {string} key
   * @param {any} value
   */
  setTag(key: string, value: any): this;
  /**
   * Adds the given key value pairs to the set of span tags.
   *
   * Multiple calls to addTags() results in the tags being the superset of
   * all calls.
   *
   * The behavior of setting the same key multiple times on the same span
   * is undefined.
   *
   * The supported type of the values is implementation-dependent.
   * Implementations are expected to safely handle all types of values but
   * may choose to ignore unrecognized / unhandle-able values (e.g. objects
   * with cyclic references, function objects).
   *
   * @return {[type]} [description]
   */
  addTags(keyValueMap: { [key: string]: any }): this;
  /**
   * Add a log record to this Span, optionally at a user-provided timestamp.
   *
   * For example:
   *
   *     span.log({
   *         size: rpc.size(),  // numeric value
   *         URI: rpc.URI(),  // string value
   *         payload: rpc.payload(),  // Object value
   *         "keys can be arbitrary strings": rpc.foo(),
   *     });
   *
   *     span.log({
   *         "error.description": someError.description(),
   *     }, someError.timestampMillis());
   *
   * @param {object} keyValuePairs
   *        An object mapping string keys to arbitrary value types. All
   *        Tracer implementations should support bool, string, and numeric
   *        value types, and some may also support Object values.
   * @param {number} timestamp
   *        An optional parameter specifying the timestamp in milliseconds
   *        since the Unix epoch. Fractional values are allowed so that
   *        timestamps with sub-millisecond accuracy can be represented. If
   *        not specified, the implementation is expected to use its notion
   *        of the current time of the call.
   */
  log(
    keyValuePairs: {
      [key: string]: any;
    },
    timestamp?: number
  ): this;
  /**
   * DEPRECATED
   */
  logEvent(eventName: string, payload: any): void;
  /**
   * Sets the end timestamp and finalizes Span state.
   *
   * With the exception of calls to Span.context() (which are always allowed),
   * finish() must be the last call made to any span instance, and to do
   * otherwise leads to undefined behavior.
   *
   * @param  {number} finishTime
   *         Optional finish time in milliseconds as a Unix timestamp. Decimal
   *         values are supported for timestamps with sub-millisecond accuracy.
   *         If not specified, the current time (as defined by the
   *         implementation) will be used.
   */
  finish(finishTime?: number): void;
  protected _context(): SpanContext;
  protected _tracer(): Tracer;
  protected _setOperationName(name: string): void;
  protected _setBaggageItem(key: string, value: string): void;
  protected _getBaggageItem(key: string): string | undefined;
  protected _addTags(keyValuePairs: { [key: string]: any }): void;
  protected _log(
    keyValuePairs: {
      [key: string]: any;
    },
    timestamp?: number
  ): void;
  protected _finish(finishTime?: number): void;
}

interface IQueryOptions {
  parentSpan: Span | undefined;
  queryName: string;
  componentPath?: string | undefined;
  forceGraphqlTracing?: boolean;
  telemetryResolverTimings?: Array<IGraphQLTelemetryRecord>;
}

export declare class GraphQLEngine {
  private runnerPromise?;
  constructor({ dbPath }: { dbPath: string });
  private _doGetRunner;
  private getRunner;
  ready(): Promise<void>;
  runQuery(
    query: string | Source,
    context?: Record<string, any>,
    opts?: IQueryOptions
  ): Promise<ExecutionResult>;
  findPageByPath(pathName: string): IGatsbyPage | undefined;
}

/////////////////////// page-ssr-module/entry

declare type PageContext = Record<string, any>;
interface IExecutionResult extends ExecutionResult {
  pageContext?: PageContext;
  serverData?: unknown;
}

interface IScriptsAndStyles {
  scripts: Array<any>;
  styles: Array<any>;
  reversedStyles: Array<any>;
  reversedScripts: Array<any>;
}

export interface ITemplateDetails {
  query: string;
  staticQueryHashes: Array<string>;
  assets: IScriptsAndStyles;
}
export interface ISSRData {
  results: IExecutionResult;
  page: IGatsbyPage;
  templateDetails: ITemplateDetails;
  potentialPagePath: string;
  serverDataHeaders?: Record<string, string>;
  serverDataStatus?: number;
  searchString: string;
}

// TODO: I thought I could flub this part, but we definitely need a compatible type or we get a failure
declare interface ExpressRequest {
  query: string;
  method: string;
  url: string;
  headers: Record<string, string>;
}

interface ILocationPosition {
  line: number;
  column: number;
}
interface IStructuredStackFrame {
  fileName: string;
  functionName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

declare enum ErrorCategory {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  THIRD_PARTY = 'THIRD_PARTY',
}

declare enum Level {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

declare enum Type {
  GRAPHQL = 'GRAPHQL',
  CONFIG = 'CONFIG',
  WEBPACK = 'WEBPACK',
  PLUGIN = 'PLUGIN',
  COMPILATION = 'COMPILATION',
}

interface IErrorMapEntry {
  text: (context: any) => string;
  level: keyof typeof Level;
  type?: keyof typeof Type;
  category?: keyof typeof ErrorCategory;
  docsUrl?: string;
}

interface IStructuredError {
  code?: string;
  text: string;
  stack: Array<IStructuredStackFrame>;
  filePath?: string;
  location?: {
    start: ILocationPosition;
    end?: ILocationPosition;
  };
  category?: keyof typeof ErrorCategory;
  error?: Error;
  group?: string;
  level: IErrorMapEntry['level'];
  type?: IErrorMapEntry['type'];
  docsUrl?: string;
  pluginName?: string;
}

interface IPageData {
  componentChunkName: IGatsbyPage['componentChunkName'];
  matchPath?: IGatsbyPage['matchPath'];
  path: IGatsbyPage['path'];
  staticQueryHashes: Array<string>;
  getServerDataError?: IStructuredError | Array<IStructuredError> | null;
  manifestId?: string;
}

interface IPageDataWithQueryResult extends IPageData {
  result: IExecutionResult;
}

declare function getData({
  pathName,
  graphqlEngine,
  req,
  spanContext,
  telemetryResolverTimings,
}: {
  graphqlEngine: GraphQLEngine;
  pathName: string;
  req?: ExpressRequest;
  spanContext?: Span | SpanContext;
  telemetryResolverTimings?: Array<IGraphQLTelemetryRecord>;
}): Promise<ISSRData>;
declare function renderPageData({
  data,
  spanContext,
}: {
  data: ISSRData;
  spanContext?: Span | SpanContext;
}): Promise<IPageDataWithQueryResult>;
declare function renderHTML({
  data,
  pageData,
  spanContext,
}: {
  data: ISSRData;
  pageData?: IPageDataWithQueryResult;
  spanContext?: Span | SpanContext;
}): Promise<string>;

export declare type PageSSRHelpers = {
  getData: typeof getData;
  renderPageData: typeof renderPageData;
  renderHTML: typeof renderHTML;
};

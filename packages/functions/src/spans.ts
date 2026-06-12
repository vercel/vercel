export type Spans = IExportTraceServiceRequest;

export interface IExportTraceServiceRequest {
  resourceSpans?: IResourceSpans[];
}

// Datadog and other providers identify the service at the resource level.
export interface IResourceSpans {
  resource?: IResource;
  scopeSpans: IScopeSpans[];
  schemaUrl?: string;
}

export interface IResource {
  attributes: IKeyValue[];
  droppedAttributesCount?: number;
}

export interface IScopeSpans {
  scope?: IInstrumentationScope;
  spans?: ISpan[];
  schemaUrl?: string | null;
}

export interface ISpan {
  startTimeUnixNano: Fixed64;
  endTimeUnixNano: Fixed64;
  attributes?: IKeyValue[];
  spanId: string;
  name: string;
  events?: IEvent[];
  parentSpanId?: string;
  traceId: string;
  kind: ESpanKind;
  traceState?: string | null;
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  links?: ILink[];
  droppedLinksCount?: number;
  status?: {
    message?: string;
    code: EStatusCode;
  };
}

/**
 * SpanKind is the type of span. Can be used to specify additional relationships
 * between spans in addition to a parent/child relationship.
 */
export declare enum ESpanKind {
  /**
   * Unspecified. Do NOT use as default. Implementations MAY assume SpanKind to
   * be INTERNAL when receiving UNSPECIFIED.
   */
  SPAN_KIND_UNSPECIFIED = 0,
  /**
   * Indicates that the span represents an internal operation within an
   * application, as opposed to an operation happening at the boundaries.
   * Default value.
   */
  SPAN_KIND_INTERNAL = 1,
  /**
   * Indicates that the span covers server-side handling of an RPC or other
   * remote network request.
   */
  SPAN_KIND_SERVER = 2,
  /** Indicates that the span describes a request to some remote service. */
  SPAN_KIND_CLIENT = 3,
  /**
   * Indicates that the span describes a producer sending a message to a broker.
   * Unlike CLIENT and SERVER, there is often no direct critical path latency
   * relationship between producer and consumer spans. A PRODUCER span ends when
   * the message was accepted by the broker while the logical processing of the
   * message might span a much longer time.
   */
  SPAN_KIND_PRODUCER = 4,
  /**
   * Indicates that the span describes consumer receiving a message from a
   * broker. Like the PRODUCER kind, there is often no direct critical path
   * latency relationship between producer and consumer spans.
   */
  SPAN_KIND_CONSUMER = 5,
}

export declare enum EStatusCode {
  /** The default status. */
  STATUS_CODE_UNSET = 0,
  /**
   * The Span has been evaluated by an Application developers or Operator to have
   * completed successfully.
   */
  STATUS_CODE_OK = 1,
  /** The Span contains an error. */
  STATUS_CODE_ERROR = 2,
}

export interface IEvent {
  timeUnixNano: Fixed64;
  name: string;
  attributes: IKeyValue[];
  droppedAttributesCount?: number;
}

export interface ILink {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: IKeyValue[];
  droppedAttributesCount: number;
}

export interface IInstrumentationScope {
  name: string;
  version?: string;
  attributes?: IKeyValue[];
  droppedAttributesCount?: number;
}

export interface IKeyValue {
  key: string;
  value: IAnyValue;
}

export interface IAnyValue {
  stringValue?: string | null;
  boolValue?: boolean | null;
  intValue?: number | null;
  doubleValue?: number | null;
  arrayValue?: IArrayValue;
  kvlistValue?: IKeyValueList;
  bytesValue?: Uint8Array;
}

export interface IArrayValue {
  values: IAnyValue[];
}

export interface IKeyValueList {
  values: IKeyValue[];
}

export interface LongBits {
  low: number;
  high: number;
}

export type Fixed64 = LongBits | string | number;

/**
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/5954fdeb908ca2123c8dd6e9d51958147b434618/api/src/trace/span_context.ts#L25
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  /**
   * Trace flags to propagate.
   *
   * It is represented as 1 byte (bitmap). Bit to represent whether trace is
   * sampled or not. When set, the least significant bit documents that the
   * caller may have recorded trace data. A caller who does not record trace data
   * out-of-band leaves this flag unset.
   */
  traceFlags?: number;
}

/**
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/5954fdeb908ca2123c8dd6e9d51958147b434618/api/src/trace/span.ts#L35
 */
export interface Span {
  /**
   * Returns the {@link SpanContext} object associated with this Span.
   *
   * Get an immutable, serializable identifier for this span that can be used to
   * create new child spans. Returned SpanContext is usable even after the span
   * ends.
   *
   * @returns the SpanContext object associated with this Span.
   */
  spanContext(): SpanContext;
}

/**
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/5954fdeb908ca2123c8dd6e9d51958147b434618/api/src/context/types.ts#L20
 */
export interface Context {
  /**
   * Get a value from the context.
   *
   * @param key key which identifies a context value
   */
  getValue(key: symbol): unknown;
}

/**
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/5954fdeb908ca2123c8dd6e9d51958147b434618/api/src/context/types.ts#L49
 */
export interface ContextManager {
  /** Get the current active context. */
  active(): Context;
}

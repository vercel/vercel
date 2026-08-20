import { getContext } from './get-context';

const SCOPE_NAME = 'vercel.functions';
const INTERNAL_SPAN_KIND = 1;

export type Spans = {
  resourceSpans?: Array<{
    scopeSpans: Array<{
      scope?: { name: string; version?: string };
      spans?: Array<{
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        name: string;
        kind: number;
        startTimeUnixNano: string;
        endTimeUnixNano: string;
        attributes: KeyValue[];
        droppedAttributesCount: number;
        events: unknown[];
        droppedEventsCount: number;
        status: { code: number; message?: string };
        links: unknown[];
        droppedLinksCount: number;
      }>;
    }>;
  }>;
};

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags?: number;
}

interface KeyValue {
  key: string;
  value: AnyValue;
}

interface AnyValue {
  stringValue?: string | null;
  boolValue?: boolean;
  intValue?: number;
  doubleValue?: number;
}

interface Instrument {
  createSpan(name: string): Instrument;
  setAttribute(key: string, value: SpanAttributeValue): Instrument;
  setAttributes(attributes: Record<string, SpanAttributeValue>): Instrument;
  end(): void;
}

type SpanAttributeValue = string | number | boolean | null | undefined;

class NoopSpan implements Instrument {
  end() {}
  createSpan() {
    return this;
  }
  setAttribute() {
    return this;
  }
  setAttributes() {
    return this;
  }
}

class Span implements Instrument {
  private startTime = unixTimeNano();
  private startPerformance = performance.now();
  private ended = false;
  private spanContext: SpanContext;
  private attributes: KeyValue[] = [];

  constructor(
    readonly name: string,
    private readonly parent: SpanContext,
    private reportSpans: (spans: Spans) => void
  ) {
    this.spanContext = {
      traceId: parent.traceId,
      spanId: newSpanId(),
      traceFlags: parent.traceFlags,
    };
  }

  createSpan(name: string) {
    return new Span(name, this.spanContext, this.reportSpans);
  }

  setAttribute(key: string, value: SpanAttributeValue) {
    const attribute = toKeyValue(key, value);
    const existingAttributeIndex = this.attributes.findIndex(
      ({ key: attributeKey }) => attributeKey === key
    );

    if (existingAttributeIndex === -1) {
      this.attributes.push(attribute);
    } else {
      this.attributes[existingAttributeIndex] = attribute;
    }

    return this;
  }

  setAttributes(attributes: Record<string, SpanAttributeValue>) {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }

    return this;
  }

  end() {
    if (this.ended) {
      return;
    }

    const endedAt =
      this.startTime +
      BigInt(
        Math.round((performance.now() - this.startPerformance) * 1_000_000)
      );
    const payload: Spans = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              scope: { name: SCOPE_NAME },
              spans: [
                {
                  traceId: this.spanContext.traceId,
                  spanId: this.spanContext.spanId,
                  parentSpanId: this.parent.spanId,
                  name: this.name,
                  kind: INTERNAL_SPAN_KIND,
                  startTimeUnixNano: this.startTime.toString(),
                  endTimeUnixNano: endedAt.toString(),
                  attributes: this.attributes,
                  droppedAttributesCount: 0,
                  events: [],
                  droppedEventsCount: 0,
                  status: { code: 0 },
                  links: [],
                  droppedLinksCount: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    this.reportSpans(payload);
    this.ended = true;
  }
}

export function createRootSpan(name: string): Instrument {
  const context = getContext();
  const telemetry = context?.telemetry;
  if (telemetry?.reportSpans && telemetry.rootSpanContext) {
    return new Span(name, telemetry.rootSpanContext, telemetry.reportSpans);
  }
  return new NoopSpan();
}

function toKeyValue(key: string, value: SpanAttributeValue): KeyValue {
  return { key, value: toAnyValue(value) };
}

function toAnyValue(value: SpanAttributeValue): AnyValue {
  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { boolValue: value };
  }

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: value }
      : { doubleValue: value };
  }

  return { stringValue: null };
}

function unixTimeNano(): bigint {
  return BigInt(Date.now()) * 1000000n;
}

function newSpanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

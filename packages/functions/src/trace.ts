import { getContext } from './get-context';
import type { SpanContext, Spans } from './spans';

const SCOPE_NAME = 'vercel.functions';
const INTERNAL_SPAN_KIND = 1;
const ZERO_SPAN_CONTEXT: SpanContext = {
  traceId: '00000000000000000000000000000000',
  spanId: '0000000000000000',
  traceFlags: 0,
};

export interface Instrument {
  createSpan(name: string): Instrument;
  end(): void;
}

class NoopSpan implements Instrument {
  end() {}
  createSpan() {
    return this;
  }
}

class Span implements Instrument {
  private startTime = unixTimeNano();
  private startHrTime = process.hrtime.bigint();
  private ended = false;
  private spanContext: SpanContext;

  constructor(
    readonly name: string,
    private readonly parent: SpanContext,
    private reportSpans: (spans: Spans) => void
  ) {
    this.spanContext = {
      traceId: parent.traceId,
      spanId: allocateSpanId(),
      traceFlags: parent.traceFlags,
    };
  }

  createSpan(name: string) {
    return new Span(name, this.spanContext, this.reportSpans);
  }

  end() {
    if (this.ended) return;
    const endedAt = this.startTime + process.hrtime.bigint() - this.startHrTime;
    this.reportSpans({
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
                },
              ],
            },
          ],
        },
      ],
    });
  }
}

export function createRootSpan(name: string): Instrument {
  const telemetry = getContext()?.telemetry;
  if (telemetry?.reportSpans && telemetry.rootSpanContext) {
    return new Span(name, telemetry.rootSpanContext, telemetry.reportSpans);
  }
  return new NoopSpan();
}

function unixTimeNano(): bigint {
  return BigInt(Date.now()) * 1000000n;
}

function allocateSpanId(): string {
  let spanId = '';

  do {
    spanId = '';
    for (let i = 0; i < 2; i++) {
      spanId += ((Math.random() * 2 ** 32) >>> 0).toString(16).padStart(8, '0');
    }
  } while (spanId === ZERO_SPAN_CONTEXT.spanId);

  return spanId;
}

import { randomUUID } from 'node:crypto';

const NUM_OF_MICROSEC_IN_NANOSEC = BigInt('1000');

export type SpanId = string;

export type TraceEvent = {
  parentId?: SpanId;
  name: string;
  id: SpanId;
  timestamp: number;
  duration: number;
  tags: Record<string, string>;
  startTime: number;
};

export type Reporter = {
  report: (event: TraceEvent) => void;
};

interface Attributes {
  [key: string]: string | undefined;
}

function mapUndefinedAttributes(attrs: Attributes | undefined): {
  [key: string]: string;
} {
  return Object.fromEntries(
    Object.entries(attrs ?? {}).filter<[string, string]>(
      (attr): attr is [string, string] => !!attr[1]
    )
  );
}

export class Span {
  private name: string;
  private id: SpanId;
  private parentId?: SpanId;
  private attrs: { [key: string]: string };
  private status: 'started' | 'stopped';

  // Number of nanoseconds since epoch.
  private _start: bigint;
  private now: number;

  private _reporter: Reporter | undefined;

  constructor({
    name,
    parentId,
    attrs,
    reporter,
  }: {
    name: string;
    parentId?: SpanId;
    attrs?: Attributes;
    reporter?: Reporter;
  }) {
    this.name = name;
    this.parentId = parentId;
    this.attrs = mapUndefinedAttributes(attrs);
    this.status = 'started';

    this.id = randomUUID();
    this._reporter = reporter;

    // hrtime cannot be used to reconstruct tracing span's actual start time
    // since it does not have relation to clock time:
    // `These times are relative to an arbitrary time in the past, and not related to the time of day and therefore not subject to clock drift`
    // https://nodejs.org/api/process.html#processhrtimetime
    // Capturing current datetime as additional metadata for external reconstruction.
    this.now = Date.now();
    this._start = process.hrtime.bigint();
  }

  stop() {
    if (this.status === 'stopped') {
      throw new Error(`Cannot stop a span which is already stopped`);
    }

    this.status = 'stopped';

    const end = process.hrtime.bigint();
    const duration = Number((end - this._start) / NUM_OF_MICROSEC_IN_NANOSEC);

    const timestamp = Number(this._start / NUM_OF_MICROSEC_IN_NANOSEC);

    const traceEvent: TraceEvent = {
      name: this.name,
      duration,
      timestamp,
      id: this.id,
      parentId: this.parentId,
      tags: this.attrs,
      startTime: this.now,
    };

    if (this._reporter) {
      this._reporter.report(traceEvent);
    }
  }

  setAttributes(attrs: Attributes) {
    Object.assign(this.attrs, mapUndefinedAttributes(attrs));
  }

  child(name: string, attrs?: Attributes) {
    return new Span({
      name,
      parentId: this.id,
      attrs,
      reporter: this._reporter,
    });
  }

  async trace<T>(fn: (span: Span) => T | Promise<T>): Promise<T> {
    try {
      return await fn(this);
    } finally {
      this.stop();
    }
  }
}

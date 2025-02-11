import { randomUUID } from 'node:crypto';

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
  flushAll: (opts?: { end: boolean }) => Promise<void> | void;
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
  private _start: number;

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
    this._start = Date.now();
    this._reporter = reporter;
  }

  stop() {
    if (this.status === 'stopped') {
      throw new Error(`Cannot stop a span which is already stopped`);
    }

    this.status = 'stopped';

    // durations are reported in microseconds
    const duration = (Date.now() - this._start) * 1000;

    const traceEvent: TraceEvent = {
      name: this.name,
      duration: Number(duration),
      timestamp: this._start,
      id: this.id,
      parentId: this.parentId,
      tags: this.attrs,
      startTime: this._start,
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

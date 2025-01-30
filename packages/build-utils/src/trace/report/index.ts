import type { TraceEvent } from '../types';
import reportToJson from './to-json';
import type { Reporter } from './types';

class MultiReporter implements Reporter {
  private reporters: Reporter[] = [];

  constructor(reporters: Reporter[]) {
    this.reporters = reporters;
  }

  async flushAll(opts?: { end: boolean }) {
    await Promise.all(this.reporters.map(reporter => reporter.flushAll(opts)));
  }

  report(event: TraceEvent) {
    // biome-ignore lint/complexity/noForEach: <explanation>
    this.reporters.forEach(reporter => reporter.report(event));
  }
}

// JSON is always reported to allow for diagnostics
export const reporter = new MultiReporter([reportToJson]);

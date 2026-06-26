import type { Reporter, TraceEvent } from '@vercel/build-utils';
import { Span } from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import { withSpan } from '../src/util';

class CollectingReporter implements Reporter {
  public events: TraceEvent[] = [];
  report(event: TraceEvent) {
    this.events.push(event);
  }
}

function rootSpan() {
  const reporter = new CollectingReporter();
  const span = new Span({ name: 'root', reporter });
  return { reporter, span };
}

describe('withSpan', () => {
  it('reports the span and runs without a parent (tracing disabled)', async () => {
    // No parent span: fn runs directly and nothing is reported.
    const result = await withSpan(undefined, 'noop', {}, () => 42);
    expect(result).toBe(42);
  });

  it('reports a child span on success', async () => {
    const { reporter, span } = rootSpan();

    const result = await withSpan(span, 'step', { foo: 'bar' }, () => 'ok');

    expect(result).toBe('ok');
    const event = reporter.events.find(e => e.name === 'step');
    expect(event).toBeDefined();
    expect(event?.tags).toMatchObject({ foo: 'bar' });
    // No error tags on success.
    expect(event?.tags).not.toHaveProperty('error');
  });

  it('records the error on the span and re-throws when fn rejects', async () => {
    const { reporter, span } = rootSpan();

    const boom = new TypeError('registry login denied');

    await expect(
      withSpan(span, 'container.registry_login', {}, async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    // The span is still reported (Span.trace stops it in a finally) and now
    // carries the error so the failed step is distinguishable in the trace.
    const event = reporter.events.find(
      e => e.name === 'container.registry_login'
    );
    expect(event).toBeDefined();
    expect(event?.tags).toMatchObject({
      error: 'true',
      'error.message': 'registry login denied',
      'error.type': 'TypeError',
    });
  });

  it('falls back to sensible error tags for non-Error throws', async () => {
    const { reporter, span } = rootSpan();

    await expect(
      withSpan(span, 'step', {}, async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'plain string failure';
      })
    ).rejects.toBe('plain string failure');

    const event = reporter.events.find(e => e.name === 'step');
    expect(event?.tags).toMatchObject({
      error: 'true',
      'error.message': 'plain string failure',
      'error.type': 'Error',
    });
  });
});

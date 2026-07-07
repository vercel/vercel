import { describe, expect, it } from 'vitest';
import { Span, type TraceEvent } from '../src';

// reportChildEvents lets a parent process ingest a tree of trace events produced elsewhere
// (e.g. the `vc build` builder worker) and nest it under one of its spans, reparenting the
// tree's root(s) while preserving links internal to the set.
describe('Span.reportChildEvents', () => {
  function event(
    id: string,
    parentId: string | undefined,
    name = id
  ): TraceEvent {
    return {
      id,
      parentId,
      name,
      timestamp: 1,
      duration: 1,
      tags: {},
      startTime: 1,
    };
  }

  it('reparents root events under the span and preserves internal links', () => {
    const reported: TraceEvent[] = [];
    const parent = new Span({
      name: 'vc.builder',
      reporter: { report: e => reported.push(e) },
    });

    // A worker tree: `root` (its parentId points outside the set), and `child` under `root`.
    const events = [event('root', 'some-worker-id'), event('child', 'root')];
    parent.reportChildEvents(events);

    const byId = new Map(reported.map(e => [e.id, e]));
    // The root is reparented under this span...
    expect(byId.get('root')?.parentId).toBe(
      (parent as unknown as { id: string }).id
    );
    // ...while the internal link is untouched.
    expect(byId.get('child')?.parentId).toBe('root');
  });

  it('treats an event with no parentId as a root', () => {
    const reported: TraceEvent[] = [];
    const parent = new Span({
      name: 'vc.builder',
      reporter: { report: e => reported.push(e) },
    });

    parent.reportChildEvents([event('orphan', undefined)]);
    expect(reported[0].parentId).toBe((parent as unknown as { id: string }).id);
  });

  it('does not mutate the events passed in', () => {
    const parent = new Span({
      name: 'vc.builder',
      reporter: { report: () => {} },
    });
    const root = event('root', 'outside');
    parent.reportChildEvents([root]);
    expect(root.parentId).toBe('outside');
  });

  it('is a no-op when the span has no reporter', () => {
    const parent = new Span({ name: 'vc.builder' });
    expect(() =>
      parent.reportChildEvents([event('x', undefined)])
    ).not.toThrow();
  });
});

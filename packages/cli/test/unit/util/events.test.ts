import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { Response } from '../../../src/util/fetch';
import printEvents from '../../../src/util/events';

const { mockDebug } = vi.hoisted(() => ({ mockDebug: vi.fn() }));

vi.mock('../../../src/output-manager', () => ({
  default: {
    debug: mockDebug,
    log: vi.fn(),
  },
}));

vi.mock('../../../src/util/get-deployment', () => ({ default: vi.fn() }));
vi.mock('../../../src/util/get-scope', () => ({ default: vi.fn() }));

describe('printEvents()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces matching alias events without forwarding them as build logs', async () => {
    const aliasEvent = {
      type: 'alias-assigned' as const,
      deploymentId: 'dpl_123',
      date: 1783370781619,
      alias: ['final.vercel.app'],
      aliasError: null,
      aliasWarning: {
        code: 'alias_warning',
        message: 'Alias warning',
      },
    };
    const buildLog = {
      type: 'stdout',
      deploymentId: 'dpl_123',
      created: 1783370781600,
      date: 1783370781600,
      text: 'Build complete',
    };
    const client = {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            `${JSON.stringify(aliasEvent)}\n${JSON.stringify(buildLog)}\n`
          )
        ),
    };
    const onAliasAssigned = vi.fn();
    const onEvent = vi.fn();

    await printEvents(
      client as never,
      'dpl_123',
      {
        mode: 'logs',
        onAliasAssigned,
        onEvent,
        quiet: true,
        findOpts: { direction: 'forward', follow: true },
      },
      new AbortController()
    );

    expect(onAliasAssigned).toHaveBeenCalledWith(aliasEvent);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(buildLog);
  });

  it('ignores alias events for another deployment', async () => {
    const aliasEvent = {
      type: 'alias-assigned',
      deploymentId: 'dpl_other',
      date: 1783370781619,
    };
    const client = {
      fetch: vi
        .fn()
        .mockResolvedValue(new Response(`${JSON.stringify(aliasEvent)}\n`)),
    };
    const onAliasAssigned = vi.fn();
    const onEvent = vi.fn();

    await printEvents(client as never, 'dpl_123', {
      mode: 'logs',
      onAliasAssigned,
      onEvent,
      quiet: true,
      findOpts: { direction: 'forward', follow: true },
    });

    expect(onAliasAssigned).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('does not signal alias assignment when the stream errors', async () => {
    const body = new ReadableStream({
      start(controller) {
        queueMicrotask(() => controller.error(new Error('stream failed')));
      },
    });
    const client = {
      fetch: vi.fn().mockResolvedValue(new Response(body)),
    };
    const abortController = new AbortController();
    const onAliasAssigned = vi.fn();

    const promise = printEvents(
      client as never,
      'dpl_123',
      {
        mode: 'logs',
        onAliasAssigned,
        onEvent: vi.fn(),
        quiet: true,
        findOpts: { direction: 'forward', follow: true },
      },
      abortController
    );

    await vi.waitFor(() =>
      expect(mockDebug).toHaveBeenCalledWith(
        'Deployment event stream error: stream failed'
      )
    );
    abortController.abort();
    await promise;

    expect(onAliasAssigned).not.toHaveBeenCalled();
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });
});

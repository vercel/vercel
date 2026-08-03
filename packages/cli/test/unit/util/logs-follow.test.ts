import { describe, it, expect } from 'vitest';
import {
  assignRequestPrefix,
  formatFollowHuman,
  formatFollowJson,
  processFollowRows,
  type FollowEvent,
} from '../../../src/util/logs-follow';
import type { RequestLogEntry } from '../../../src/util/logs-v2';

function createRow(
  overrides: Partial<RequestLogEntry> & { id: string }
): RequestLogEntry {
  return {
    timestamp: 1_753_714_925_020,
    deploymentId: 'dpl_test',
    projectId: 'prj_test',
    level: 'info',
    message: '',
    source: 'serverless',
    domain: 'example.vercel.app',
    requestMethod: 'GET',
    requestPath: '/api/test',
    responseStatusCode: 0,
    environment: 'preview',
    branch: 'main',
    logs: [],
    eventsCount: 0,
    ...overrides,
  };
}

describe('logs-follow', () => {
  describe('processFollowRows', () => {
    it('emits started, logs, then finished as a request settles', () => {
      const state = new Map();
      const prefixes = new Map<string, string>();

      const first = processFollowRows(
        [
          createRow({
            id: 'req_aaaa',
            logs: [{ level: 'info', message: 'hello' }],
            eventsCount: 0,
            responseStatusCode: 0,
          }),
        ],
        state,
        prefixes
      );

      expect(first.map(e => e.type)).toEqual(['request_started', 'log']);
      expect(first[0]).toMatchObject({
        type: 'request_started',
        requestId: 'req_aaaa',
        responseStatusCode: null,
      });
      expect(first[1]).toMatchObject({
        type: 'log',
        message: 'hello',
      });

      const second = processFollowRows(
        [
          createRow({
            id: 'req_aaaa',
            logs: [{ level: 'info', message: 'hello' }],
            responseStatusCode: 200,
            requestDurationMs: 45,
          }),
        ],
        state,
        prefixes
      );

      expect(second.map(e => e.type)).toEqual(['request_finished']);
      expect(second[0]).toMatchObject({
        type: 'request_finished',
        responseStatusCode: 200,
        durationMs: 45,
      });
    });

    it('does not re-emit logs across overlapping polls', () => {
      const state = new Map();
      const prefixes = new Map<string, string>();
      const row = createRow({
        id: 'req_bbbb',
        logs: [
          { level: 'info', message: 'one' },
          { level: 'info', message: 'two' },
        ],
        responseStatusCode: 200,
        requestDurationMs: 10,
      });

      const first = processFollowRows([row], state, prefixes);
      expect(first.map(e => e.type)).toEqual([
        'request_started',
        'log',
        'log',
        'request_finished',
      ]);

      const second = processFollowRows([row], state, prefixes);
      expect(second).toEqual([]);
    });

    it('keeps interleaved requests attributable by requestId', () => {
      const state = new Map();
      const prefixes = new Map<string, string>();

      const events = processFollowRows(
        [
          createRow({
            id: 'req_checkout_a1b2',
            requestMethod: 'POST',
            requestPath: '/api/checkout',
            timestamp: 100,
            logs: [{ level: 'info', message: 'creating payment intent' }],
          }),
          createRow({
            id: 'req_cart_c3d4',
            requestMethod: 'GET',
            requestPath: '/api/cart',
            timestamp: 101,
            logs: [{ level: 'info', message: 'loaded cart' }],
            eventsCount: 1,
            responseStatusCode: 200,
            requestDurationMs: 20,
          }),
        ],
        state,
        prefixes
      );

      expect(events.filter(e => e.requestId.endsWith('a1b2')).map(e => e.type)).toEqual([
        'request_started',
        'log',
      ]);
      expect(events.filter(e => e.requestId.endsWith('c3d4')).map(e => e.type)).toEqual([
        'request_started',
        'log',
        'request_finished',
      ]);
    });

    it('emits started and finished for silent requests', () => {
      const state = new Map();
      const prefixes = new Map<string, string>();
      const events = processFollowRows(
        [
          createRow({
            id: 'req_silent',
            source: 'static',
            eventsCount: 1,
            responseStatusCode: 200,
            requestDurationMs: 14,
            logs: [],
          }),
        ],
        state,
        prefixes
      );

      expect(events.map(e => e.type)).toEqual([
        'request_started',
        'request_finished',
      ]);
    });
  });

  describe('assignRequestPrefix', () => {
    it('uses the last 4 characters by default', () => {
      const active = new Map<string, string>();
      expect(assignRequestPrefix('iad1::abc-1234-a1b2', active)).toEqual('a1b2');
    });

    it('lengthens prefixes on collision', () => {
      const active = new Map<string, string>([['other', 'a1b2']]);
      expect(assignRequestPrefix('xxxxa1b2', active)).toEqual('xa1b2');
    });
  });

  describe('formatters', () => {
    const started: FollowEvent = {
      type: 'request_started',
      timestamp: 1_753_714_925_020,
      requestId: 'req_a1b2',
      deploymentId: 'dpl_1',
      projectId: 'prj_1',
      environment: 'preview',
      branch: 'main',
      domain: 'example.vercel.app',
      requestMethod: 'POST',
      requestPath: '/api/checkout',
      source: 'serverless',
      level: 'info',
      responseStatusCode: null,
    };

    it('formats human started/finished with full details', () => {
      const startedText = formatFollowHuman(started, 'a1b2');
      expect(startedText).toContain('[a1b2]');
      expect(startedText).toContain('POST');
      expect(startedText).toContain('/api/checkout');
      expect(startedText).toContain('Request started');

      const finishedText = formatFollowHuman(
        {
          ...started,
          type: 'request_finished',
          responseStatusCode: 402,
          level: 'error',
          durationMs: 890,
        },
        'a1b2'
      );
      expect(finishedText).toContain('402');
      expect(finishedText).toContain('Request finished (890ms)');
    });

    it('formats human log blocks like current follow output', () => {
      const text = formatFollowHuman(
        {
          ...started,
          type: 'log',
          message: 'creating payment intent',
          level: 'info',
        },
        'a1b2'
      );
      expect(text).toContain('[a1b2]');
      expect(text).toContain('creating payment intent');
      expect(text).toContain('---');
    });

    it('formats JSON event stream objects', () => {
      expect(formatFollowJson(started)).toMatchObject({
        type: 'request_started',
        requestId: 'req_a1b2',
        responseStatusCode: null,
      });
      expect(
        formatFollowJson({
          ...started,
          type: 'log',
          message: 'hi',
          messageTruncated: false,
        })
      ).toMatchObject({
        type: 'log',
        message: 'hi',
      });
      expect(
        formatFollowJson({
          ...started,
          type: 'request_finished',
          responseStatusCode: 200,
          durationMs: 12,
        })
      ).toMatchObject({
        type: 'request_finished',
        responseStatusCode: 200,
        durationMs: 12,
      });
    });
  });
});

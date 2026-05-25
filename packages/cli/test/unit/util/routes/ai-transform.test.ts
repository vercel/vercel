import { describe, it, expect } from 'vitest';
import {
  generatedRouteToAddInput,
  convertRouteToCurrentRoute,
  routingRuleToCurrentRoute,
} from '../../../../src/util/routes/ai-transform';
import type { GeneratedRoute } from '../../../../src/util/routes/generate-route';
import type { RoutingRule } from '../../../../src/util/routes/types';

describe('ai-transform', () => {
  describe('generatedRouteToAddInput', () => {
    it('should convert a simple rewrite', () => {
      const generated: GeneratedRoute = {
        name: 'API Proxy',
        description: 'Proxy API requests',
        pathCondition: { value: '/api/:path*', syntax: 'path-to-regexp' },
        actions: [{ type: 'rewrite', dest: 'https://backend.internal/:path*' }],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result).toEqual({
        name: 'API Proxy',
        description: 'Proxy API requests',
        srcSyntax: 'path-to-regexp',
        route: {
          src: '/api/:path*',
          dest: 'https://backend.internal/:path*',
        },
      });
    });

    it('should convert a redirect with status', () => {
      const generated: GeneratedRoute = {
        name: 'Old Blog',
        description: '',
        pathCondition: { value: '/blog', syntax: 'equals' },
        actions: [{ type: 'redirect', dest: '/articles', status: 301 }],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result).toEqual({
        name: 'Old Blog',
        description: undefined,
        srcSyntax: 'equals',
        route: {
          src: '/blog',
          dest: '/articles',
          status: 301,
        },
      });
    });

    it('should convert a set-status action', () => {
      const generated: GeneratedRoute = {
        name: 'Block Path',
        description: 'Return 403',
        pathCondition: { value: '^/admin/.*$', syntax: 'regex' },
        actions: [{ type: 'set-status', status: 403 }],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.status).toBe(403);
      expect(result.route.dest).toBeUndefined();
    });

    it('should convert conditions with operators', () => {
      const generated: GeneratedRoute = {
        name: 'Auth Check',
        description: '',
        pathCondition: { value: '/api/:path*', syntax: 'path-to-regexp' },
        conditions: [
          {
            field: 'header',
            operator: 'contains',
            key: 'Accept',
            value: 'json',
            missing: false,
          },
          {
            field: 'cookie',
            operator: 'exists',
            key: 'session',
            missing: false,
          },
          {
            field: 'header',
            operator: 'eq',
            key: 'X-Bot',
            value: 'true',
            missing: true,
          },
        ],
        actions: [{ type: 'rewrite', dest: '/api-backend/:path*' }],
      };

      const result = generatedRouteToAddInput(generated);

      // contains=json → .*json.*
      expect(result.route.has).toHaveLength(2);
      expect(result.route.has![0]).toEqual({
        type: 'header',
        key: 'Accept',
        value: '.*json.*',
      });
      // exists → no value
      expect(result.route.has![1]).toEqual({
        type: 'cookie',
        key: 'session',
      });

      // missing condition with eq=true → ^true$
      expect(result.route.missing).toHaveLength(1);
      expect(result.route.missing![0]).toEqual({
        type: 'header',
        key: 'X-Bot',
        value: '^true$',
      });
    });

    it('should convert host conditions', () => {
      const generated: GeneratedRoute = {
        name: 'Host Route',
        description: '',
        pathCondition: { value: '/(.*)', syntax: 'regex' },
        conditions: [
          {
            field: 'host',
            operator: 'eq',
            value: 'example.com',
            missing: false,
          },
        ],
        actions: [{ type: 'rewrite', dest: '/main/$1' }],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.has![0]).toEqual({
        type: 'host',
        value: '^example\\.com$',
      });
    });

    it('should convert response header set actions to headers object', () => {
      const generated: GeneratedRoute = {
        name: 'CORS',
        description: '',
        pathCondition: { value: '/api/(.*)', syntax: 'regex' },
        actions: [
          {
            type: 'modify',
            subType: 'response-headers',
            headers: [
              { key: 'Access-Control-Allow-Origin', value: '*', op: 'set' },
              { key: 'X-Frame-Options', value: 'DENY', op: 'set' },
            ],
          },
        ],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.headers).toEqual({
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'DENY',
      });
      expect(result.route.transforms).toBeUndefined();
    });

    it('should convert response header append/delete to transforms', () => {
      const generated: GeneratedRoute = {
        name: 'Headers',
        description: '',
        pathCondition: { value: '/(.*)', syntax: 'regex' },
        actions: [
          {
            type: 'modify',
            subType: 'response-headers',
            headers: [
              {
                key: 'X-Custom',
                value: 'extra',
                op: 'append',
              },
              { key: 'Server', op: 'delete' },
            ],
          },
        ],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.headers).toBeUndefined();
      expect(result.route.transforms).toHaveLength(2);
      expect(result.route.transforms![0]).toEqual({
        type: 'response.headers',
        op: 'append',
        target: { key: 'X-Custom' },
        args: 'extra',
      });
      expect(result.route.transforms![1]).toEqual({
        type: 'response.headers',
        op: 'delete',
        target: { key: 'Server' },
      });
    });

    it('should convert request header transforms', () => {
      const generated: GeneratedRoute = {
        name: 'Req Transform',
        description: '',
        pathCondition: { value: '/(.*)', syntax: 'regex' },
        actions: [
          {
            type: 'modify',
            subType: 'transform-request-header',
            headers: [{ key: 'X-Forwarded-For', value: '1.2.3.4', op: 'set' }],
          },
        ],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.transforms).toHaveLength(1);
      expect(result.route.transforms![0]).toEqual({
        type: 'request.headers',
        op: 'set',
        target: { key: 'X-Forwarded-For' },
        args: '1.2.3.4',
      });
    });

    it('should convert request query transforms', () => {
      const generated: GeneratedRoute = {
        name: 'Query Transform',
        description: '',
        pathCondition: { value: '/(.*)', syntax: 'regex' },
        actions: [
          {
            type: 'modify',
            subType: 'transform-request-query',
            headers: [{ key: 'utm_source', op: 'delete' }],
          },
        ],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.transforms).toHaveLength(1);
      expect(result.route.transforms![0]).toEqual({
        type: 'request.query',
        op: 'delete',
        target: { key: 'utm_source' },
      });
    });

    it('should combine multiple action types', () => {
      const generated: GeneratedRoute = {
        name: 'Full Route',
        description: 'Everything',
        pathCondition: { value: '/app/(.*)', syntax: 'regex' },
        actions: [
          { type: 'rewrite', dest: '/backend/$1' },
          {
            type: 'modify',
            subType: 'response-headers',
            headers: [{ key: 'Cache-Control', value: 'no-store', op: 'set' }],
          },
          {
            type: 'modify',
            subType: 'transform-request-header',
            headers: [{ key: 'X-Real-IP', value: '$client_ip', op: 'set' }],
          },
        ],
      };

      const result = generatedRouteToAddInput(generated);

      expect(result.route.dest).toBe('/backend/$1');
      expect(result.route.headers).toEqual({
        'Cache-Control': 'no-store',
      });
      expect(result.route.transforms).toHaveLength(1);
    });
  });

  describe('convertRouteToCurrentRoute', () => {
    it('should pass through pathCondition, conditions, and actions', () => {
      const generated: GeneratedRoute = {
        name: 'Test',
        description: 'Desc',
        pathCondition: { value: '/test', syntax: 'equals' },
        conditions: [
          {
            field: 'header',
            operator: 'eq',
            key: 'X-Key',
            value: 'v',
            missing: false,
          },
        ],
        actions: [{ type: 'rewrite', dest: '/dest' }],
      };

      const result = convertRouteToCurrentRoute(generated);

      expect(result.name).toBe('Test');
      expect(result.description).toBe('Desc');
      expect(result.pathCondition).toEqual({
        value: '/test',
        syntax: 'equals',
      });
      expect(result.conditions).toEqual(generated.conditions);
      expect(result.actions).toEqual(generated.actions);
    });

    it('should set description to undefined for empty string', () => {
      const generated: GeneratedRoute = {
        name: 'Test',
        description: '',
        pathCondition: { value: '/test', syntax: 'equals' },
        actions: [{ type: 'rewrite', dest: '/dest' }],
      };

      const result = convertRouteToCurrentRoute(generated);

      expect(result.description).toBeUndefined();
    });
  });

  describe('routingRuleToCurrentRoute', () => {
    it('should convert a rewrite rule', () => {
      const rule = {
        id: 'r1',
        name: 'API Proxy',
        description: 'Proxy to backend',
        srcSyntax: 'path-to-regexp' as const,
        route: {
          src: '/api/:path*',
          dest: 'https://backend.internal/:path*',
        },
        enabled: true,
        position: 0,
        routeType: 'rewrite',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      expect(result.name).toBe('API Proxy');
      expect(result.description).toBe('Proxy to backend');
      expect(result.pathCondition).toEqual({
        value: '/api/:path*',
        syntax: 'path-to-regexp',
      });
      expect(result.actions).toEqual([
        { type: 'rewrite', dest: 'https://backend.internal/:path*' },
      ]);
    });

    it('should convert a redirect rule', () => {
      const rule = {
        id: 'r2',
        name: 'Old Blog',
        srcSyntax: 'equals' as const,
        route: { src: '/blog', dest: '/articles', status: 301 },
        enabled: true,
        position: 1,
        routeType: 'redirect',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      expect(result.actions).toEqual([
        { type: 'redirect', dest: '/articles', status: 301 },
      ]);
    });

    it('should convert a set-status rule', () => {
      const rule = {
        id: 'r3',
        name: 'Block',
        route: { src: '^/blocked$', status: 403 },
        enabled: true,
        position: 2,
        routeType: 'set_status',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      expect(result.actions).toEqual([{ type: 'set-status', status: 403 }]);
    });

    it('should convert has/missing conditions', () => {
      const rule = {
        id: 'r4',
        name: 'Cond',
        route: {
          src: '/test',
          dest: '/dest',
          has: [
            { type: 'header', key: 'Authorization', value: 'Bearer.*' },
            { type: 'cookie', key: 'session' },
          ],
          missing: [{ type: 'header', key: 'X-Bot' }],
        },
        enabled: true,
        position: 3,
        routeType: 'rewrite',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      expect(result.conditions).toHaveLength(3);
      // has with value → operator 're'
      expect(result.conditions![0]).toEqual({
        field: 'header',
        operator: 're',
        key: 'Authorization',
        value: 'Bearer.*',
        missing: false,
      });
      // has without value → operator 'exists'
      expect(result.conditions![1]).toEqual({
        field: 'cookie',
        operator: 'exists',
        key: 'session',
        value: undefined,
        missing: false,
      });
      // missing
      expect(result.conditions![2]).toEqual({
        field: 'header',
        operator: 'exists',
        key: 'X-Bot',
        value: undefined,
        missing: true,
      });
    });

    it('should convert response headers to modify actions', () => {
      const rule = {
        id: 'r5',
        name: 'Headers',
        route: {
          src: '/test',
          headers: {
            'Cache-Control': 'no-store',
            'X-Custom': 'val',
          },
        },
        enabled: true,
        position: 4,
        routeType: 'transform',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      const modifyAction = result.actions.find(
        a => a.type === 'modify' && a.subType === 'response-headers'
      );
      expect(modifyAction).toBeDefined();
      expect(modifyAction!.headers).toEqual([
        { key: 'Cache-Control', value: 'no-store', op: 'set' },
        { key: 'X-Custom', value: 'val', op: 'set' },
      ]);
    });

    it('should merge response header transforms with headers', () => {
      const rule = {
        id: 'r6',
        name: 'Mixed Headers',
        route: {
          src: '/test',
          headers: { 'X-Set': 'value' },
          transforms: [
            {
              type: 'response.headers',
              op: 'append',
              target: { key: 'X-Append' },
              args: 'extra',
            },
          ],
        },
        enabled: true,
        position: 5,
        routeType: 'transform',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      const modifyAction = result.actions.find(
        a => a.type === 'modify' && a.subType === 'response-headers'
      );
      expect(modifyAction!.headers).toHaveLength(2);
      expect(modifyAction!.headers![0]).toEqual({
        key: 'X-Set',
        value: 'value',
        op: 'set',
      });
      expect(modifyAction!.headers![1]).toEqual({
        key: 'X-Append',
        value: 'extra',
        op: 'append',
      });
    });

    it('should convert request header transforms', () => {
      const rule = {
        id: 'r7',
        name: 'Req Headers',
        route: {
          src: '/test',
          transforms: [
            {
              type: 'request.headers',
              op: 'set',
              target: { key: 'X-Real-IP' },
              args: '$client_ip',
            },
          ],
        },
        enabled: true,
        position: 6,
        routeType: 'transform',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      const modifyAction = result.actions.find(
        a => a.type === 'modify' && a.subType === 'transform-request-header'
      );
      expect(modifyAction).toBeDefined();
      expect(modifyAction!.headers).toEqual([
        { key: 'X-Real-IP', value: '$client_ip', op: 'set' },
      ]);
    });

    it('should convert request query transforms', () => {
      const rule = {
        id: 'r8',
        name: 'Query',
        route: {
          src: '/test',
          transforms: [
            {
              type: 'request.query',
              op: 'delete',
              target: { key: 'utm_source' },
            },
          ],
        },
        enabled: true,
        position: 7,
        routeType: 'transform',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      const modifyAction = result.actions.find(
        a => a.type === 'modify' && a.subType === 'transform-request-query'
      );
      expect(modifyAction).toBeDefined();
      expect(modifyAction!.headers).toEqual([
        { key: 'utm_source', value: undefined, op: 'delete' },
      ]);
    });

    it('should default srcSyntax to regex when undefined', () => {
      const rule = {
        id: 'r9',
        name: 'No Syntax',
        route: { src: '^/test$', dest: '/dest' },
        enabled: true,
        position: 8,
        routeType: 'rewrite',
      } as RoutingRule;

      const result = routingRuleToCurrentRoute(rule);

      expect(result.pathCondition.syntax).toBe('regex');
    });
  });
});

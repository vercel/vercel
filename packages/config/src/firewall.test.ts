import { describe, it, expect } from 'vitest';
import { match, createFirewall } from './firewall';

describe('matchers', () => {
  it('keyless matcher with default regex op', () => {
    const expr = match.path('/admin/(.*)');
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [{ type: 'path', op: 're', value: '/admin/(.*)' }],
      },
    ]);
  });

  it('keyless matcher .Is()', () => {
    const expr = match.method.Is('GET');
    expect(expr.toConditionGroups()).toEqual([
      { conditions: [{ type: 'method', op: 'eq', value: 'GET' }] },
    ]);
  });

  it('keyless matcher .Not()', () => {
    const expr = match.method.Not('GET');
    expect(expr.toConditionGroups()).toEqual([
      { conditions: [{ type: 'method', op: 'neq', value: 'GET' }] },
    ]);
  });

  it('keyless matcher .In()', () => {
    const expr = match.country.In(['US', 'CA']);
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [{ type: 'geo_country', op: 'inc', value: ['US', 'CA'] }],
      },
    ]);
  });

  it('keyless matcher .NotIn()', () => {
    const expr = match.country.NotIn(['CN', 'RU']);
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [{ type: 'geo_country', op: 'ninc', value: ['CN', 'RU'] }],
      },
    ]);
  });

  it('keyless matcher string ops', () => {
    expect(match.path.StartsWith('/api').toConditionGroups()).toEqual([
      { conditions: [{ type: 'path', op: 'pre', value: '/api' }] },
    ]);
    expect(match.path.EndsWith('.json').toConditionGroups()).toEqual([
      { conditions: [{ type: 'path', op: 'suf', value: '.json' }] },
    ]);
    expect(match.userAgent.Contains('bot').toConditionGroups()).toEqual([
      { conditions: [{ type: 'user_agent', op: 'sub', value: 'bot' }] },
    ]);
  });

  it('keyless matcher numeric ops', () => {
    expect(match.asn.Gt(1000).toConditionGroups()).toEqual([
      { conditions: [{ type: 'geo_as_number', op: 'gt', value: 1000 }] },
    ]);
    expect(match.asn.Lte(5000).toConditionGroups()).toEqual([
      { conditions: [{ type: 'geo_as_number', op: 'lte', value: 5000 }] },
    ]);
  });

  it('keyless matcher .Exists() / .NotExists()', () => {
    expect(match.ja4Digest.Exists().toConditionGroups()).toEqual([
      { conditions: [{ type: 'ja4_digest', op: 'ex', value: '' }] },
    ]);
    expect(match.ja4Digest.NotExists().toConditionGroups()).toEqual([
      { conditions: [{ type: 'ja4_digest', op: 'nex', value: '' }] },
    ]);
  });

  it('keyed matcher', () => {
    const expr = match.header('x-api-key').Is('secret');
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [
          { type: 'header', op: 'eq', value: 'secret', key: 'x-api-key' },
        ],
      },
    ]);
  });

  it('keyed matcher .Exists()', () => {
    const expr = match.cookie('session').Exists();
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [{ type: 'cookie', op: 'ex', value: '', key: 'session' }],
      },
    ]);
  });

  it('keyed matcher .Contains()', () => {
    const expr = match.query('q').Contains('search');
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [{ type: 'query', op: 'sub', value: 'search', key: 'q' }],
      },
    ]);
  });
});

describe('AND/OR composition', () => {
  it('.and() creates separate condition groups', () => {
    const expr = match.path('/admin/(.*)').and(match.method.Not('GET'));
    expect(expr.toConditionGroups()).toEqual([
      { conditions: [{ type: 'path', op: 're', value: '/admin/(.*)' }] },
      { conditions: [{ type: 'method', op: 'neq', value: 'GET' }] },
    ]);
  });

  it('.or() adds to the same condition group', () => {
    const expr = match.asn.Is(4113).or(match.country.NotIn(['US', 'CA']));
    expect(expr.toConditionGroups()).toEqual([
      {
        conditions: [
          { type: 'geo_as_number', op: 'eq', value: 4113 },
          { type: 'geo_country', op: 'ninc', value: ['US', 'CA'] },
        ],
      },
    ]);
  });

  it('complex AND/OR composition matches CNF model', () => {
    const expr = match
      .path('/admin/(.*)')
      .and(match.method.Not('GET'))
      .and(match.asn.Is(4113).or(match.country.NotIn(['US', 'CA'])));

    expect(expr.toConditionGroups()).toEqual([
      { conditions: [{ type: 'path', op: 're', value: '/admin/(.*)' }] },
      { conditions: [{ type: 'method', op: 'neq', value: 'GET' }] },
      {
        conditions: [
          { type: 'geo_as_number', op: 'eq', value: 4113 },
          { type: 'geo_country', op: 'ninc', value: ['US', 'CA'] },
        ],
      },
    ]);
  });

  it('expressions are immutable', () => {
    const a = match.path('/a');
    const b = match.path('/b');
    const combined = a.and(b);

    // Original expressions are not mutated
    expect(a.toConditionGroups()).toHaveLength(1);
    expect(b.toConditionGroups()).toHaveLength(1);
    expect(combined.toConditionGroups()).toHaveLength(2);
  });

  it('or expressions are immutable', () => {
    const a = match.country.Is('US');
    const b = match.country.Is('CA');
    const combined = a.or(b);

    expect(a.toConditionGroups()[0].conditions).toHaveLength(1);
    expect(combined.toConditionGroups()[0].conditions).toHaveLength(2);
  });
});

describe('rule builder', () => {
  it('builds a complete block rule', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Block admin')
      .when(match.path('/admin/(.*)'))
      .then.block();

    expect(rule).toEqual({
      name: 'Block admin',
      active: true,
      conditionGroup: [
        { conditions: [{ type: 'path', op: 're', value: '/admin/(.*)' }] },
      ],
      action: { mitigate: { action: 'deny' } },
    });
  });

  it('builds a block rule with duration', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Block')
      .when(match.path('/x'))
      .then.block({ duration: '1h' });

    expect(rule.action).toEqual({
      mitigate: { action: 'deny', actionDuration: '1h' },
    });
  });

  it('builds a challenge rule', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Challenge bots')
      .when(match.botCategory.Is('automated'))
      .then.challenge();

    expect(rule.action).toEqual({
      mitigate: { action: 'challenge' },
    });
  });

  it('builds a log rule with headers', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Log API')
      .when(match.path.StartsWith('/api'))
      .then.log({ headers: ['x-request-id', 'authorization'] });

    expect(rule.action).toEqual({
      mitigate: {
        action: 'log',
        logHeaders: ['x-request-id', 'authorization'],
      },
    });
  });

  it('builds a log rule with all headers', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Log all')
      .when(match.path('/x'))
      .then.log({ headers: '*' });

    expect(rule.action).toEqual({
      mitigate: { action: 'log', logHeaders: '*' },
    });
  });

  it('builds a bypass rule', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Bypass internal')
      .when(match.ipAddress.Is('10.0.0.1'))
      .then.bypass();

    expect(rule.action).toEqual({
      mitigate: { action: 'bypass' },
    });
  });

  it('builds a rate limit rule', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Rate limit API')
      .when(match.path.StartsWith('/api'))
      .then.rateLimit({
        window: 60,
        limit: 100,
        keys: ['ip_address'],
        action: 'deny',
      });

    expect(rule.action).toEqual({
      mitigate: {
        action: 'rate_limit',
        rateLimit: {
          algo: 'fixed_window',
          window: 60,
          limit: 100,
          keys: ['ip_address'],
          action: 'deny',
        },
      },
    });
  });

  it('builds a rate limit rule with token bucket', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Rate limit')
      .when(match.path('/x'))
      .then.rateLimit({
        algo: 'token_bucket',
        window: 60,
        limit: 10,
        keys: ['ip_address'],
        action: 'challenge',
      });

    expect(rule.action.mitigate?.rateLimit?.algo).toBe('token_bucket');
  });

  it('builds a redirect rule', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Redirect blocked')
      .when(match.country.Is('XX'))
      .then.redirect('/blocked', { permanent: true });

    expect(rule.action).toEqual({
      mitigate: {
        action: 'redirect',
        redirect: { location: '/blocked', permanent: true },
      },
    });
  });

  it('redirect defaults to non-permanent', () => {
    const fw = createFirewall();
    const rule = fw.rule('Redirect').when(match.path('/x')).then.redirect('/y');

    expect(rule.action.mitigate?.redirect?.permanent).toBe(false);
  });

  it('supports description and active flag', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Test')
      .description('A test rule')
      .active(false)
      .when(match.path('/x'))
      .then.block();

    expect(rule.description).toBe('A test rule');
    expect(rule.active).toBe(false);
  });

  it('supports multiple rules inline', () => {
    const fw = createFirewall();
    const rules = [
      fw.rule('Rule 1').when(match.path('/a')).then.block(),
      fw.rule('Rule 2').when(match.path('/b')).then.log(),
    ];

    expect(rules).toHaveLength(2);
    expect(rules[0].name).toBe('Rule 1');
    expect(rules[1].name).toBe('Rule 2');
  });

  it('full inline example', () => {
    const fw = createFirewall();
    const rule = fw
      .rule('Block high-risk non-GET admin access')
      .when(
        match
          .path('/admin/(.*)')
          .and(match.method.Not('GET'))
          .and(match.asn.Is(4113).or(match.country.NotIn(['US', 'CA'])))
      )
      .then.block();

    expect(rule).toEqual({
      name: 'Block high-risk non-GET admin access',
      active: true,
      conditionGroup: [
        {
          conditions: [{ type: 'path', op: 're', value: '/admin/(.*)' }],
        },
        { conditions: [{ type: 'method', op: 'neq', value: 'GET' }] },
        {
          conditions: [
            { type: 'geo_as_number', op: 'eq', value: 4113 },
            { type: 'geo_country', op: 'ninc', value: ['US', 'CA'] },
          ],
        },
      ],
      action: { mitigate: { action: 'deny' } },
    });
  });
});

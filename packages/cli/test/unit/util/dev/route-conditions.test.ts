import { describe, expect, it } from 'vitest';
import type { HasField } from '@vercel/routing-utils';
import {
  matchRouteConditions,
  parseCookieHeader,
  type RouteConditionContext,
} from '../../../../src/util/dev/route-conditions';

function ctx(
  headers: Record<string, string | string[] | undefined> = {},
  query: Record<string, string[]> = {}
): RouteConditionContext {
  return { headers, query };
}

describe('parseCookieHeader', () => {
  it('parses name=value pairs', () => {
    expect(parseCookieHeader('a=1; b=two')).toEqual({ a: '1', b: 'two' });
  });

  it('returns an empty object for missing header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('keeps the first value on duplicates and decodes values', () => {
    expect(parseCookieHeader('a=1; a=2; b=%20x%20')).toEqual({
      a: '1',
      b: ' x ',
    });
  });

  it('unquotes quoted values', () => {
    expect(parseCookieHeader('a="quoted"')).toEqual({ a: 'quoted' });
  });
});

describe('matchRouteConditions', () => {
  it('matches when there are no conditions', () => {
    expect(matchRouteConditions(undefined, undefined, ctx())).toEqual({
      matched: true,
      params: {},
    });
  });

  it('matches `has` header presence case-insensitively', () => {
    const has: HasField = [{ type: 'header', key: 'x-rewrite-me' }];
    expect(
      matchRouteConditions(has, undefined, ctx({ 'x-rewrite-me': '1' }))
    ).toEqual({ matched: true, params: { 'x-rewrite-me': '1' } });
    expect(matchRouteConditions(has, undefined, ctx({}))).toEqual({
      matched: false,
      params: {},
    });
  });

  it('matches `has` header value as regex with named groups', () => {
    const has: HasField = [
      { type: 'header', key: 'x-id', value: '(?<id>[0-9]+)' },
    ];
    expect(
      matchRouteConditions(has, undefined, ctx({ 'x-id': 'abc123' }))
    ).toEqual({ matched: true, params: { id: '123' } });
    expect(
      matchRouteConditions(has, undefined, ctx({ 'x-id': 'nope' }))
    ).toEqual({ matched: false, params: {} });
    expect(matchRouteConditions(has, undefined, ctx({}))).toEqual({
      matched: false,
      params: {},
    });
  });

  it('treats an invalid regex as no match instead of throwing', () => {
    const has: HasField = [{ type: 'header', key: 'x-id', value: '(?<oops' }];
    expect(matchRouteConditions(has, undefined, ctx({ 'x-id': '1' }))).toEqual({
      matched: false,
      params: {},
    });
  });

  it('matches `has` cookie', () => {
    const has: HasField = [{ type: 'cookie', key: 'session' }];
    expect(
      matchRouteConditions(has, undefined, ctx({ cookie: 'a=1; session=xyz' }))
    ).toEqual({ matched: true, params: { session: 'xyz' } });
    expect(
      matchRouteConditions(has, undefined, ctx({ cookie: 'a=1' }))
    ).toEqual({ matched: false, params: {} });
  });

  it('matches `has` query, including valueless params', () => {
    const has: HasField = [{ type: 'query', key: 'id' }];
    expect(
      matchRouteConditions(has, undefined, ctx({}, { id: ['42'] }))
    ).toEqual({ matched: true, params: { id: '42' } });
    expect(
      matchRouteConditions(
        has,
        undefined,
        ctx({}, { id: [undefined as never] })
      )
    ).toEqual({ matched: true, params: { id: '' } });
    expect(matchRouteConditions(has, undefined, ctx({}, {}))).toEqual({
      matched: false,
      params: {},
    });
  });

  it('matches `has` host and strips the dev port', () => {
    const has: HasField = [{ type: 'host', value: '^example\\.com$' }];
    expect(
      matchRouteConditions(has, undefined, ctx({ host: 'example.com' }))
    ).toEqual({ matched: true, params: { host: 'example.com' } });
    expect(
      matchRouteConditions(has, undefined, ctx({ host: 'example.com:3000' }))
    ).toEqual({ matched: true, params: { host: 'example.com' } });
    expect(
      matchRouteConditions(has, undefined, ctx({ host: 'other.com' }))
    ).toEqual({ matched: false, params: {} });
  });

  it('requires every `has` condition to match', () => {
    const has: HasField = [
      { type: 'header', key: 'x-a' },
      { type: 'query', key: 'b', value: '^yes$' },
    ];
    expect(
      matchRouteConditions(has, undefined, ctx({ 'x-a': '1' }, { b: ['yes'] }))
    ).toEqual({ matched: true, params: { 'x-a': '1' } });
    expect(
      matchRouteConditions(has, undefined, ctx({ 'x-a': '1' }, { b: ['no'] }))
    ).toEqual({ matched: false, params: {} });
  });

  it('matches `missing` when the key is absent', () => {
    const missing: HasField = [{ type: 'header', key: 'x-preview' }];
    expect(matchRouteConditions(undefined, missing, ctx({}))).toEqual({
      matched: true,
      params: {},
    });
    expect(
      matchRouteConditions(undefined, missing, ctx({ 'x-preview': '1' }))
    ).toEqual({ matched: false, params: {} });
  });

  it('matches `missing` with value when it is absent or different', () => {
    const missing: HasField = [
      { type: 'query', key: 'mode', value: '^preview$' },
    ];
    expect(matchRouteConditions(undefined, missing, ctx({}, {}))).toEqual({
      matched: true,
      params: {},
    });
    expect(
      matchRouteConditions(undefined, missing, ctx({}, { mode: ['live'] }))
    ).toEqual({ matched: true, params: {} });
    expect(
      matchRouteConditions(undefined, missing, ctx({}, { mode: ['preview'] }))
    ).toEqual({ matched: false, params: {} });
  });

  it.each([
    ['eq', { eq: 'yes' }, 'yes', true],
    ['eq', { eq: 'yes' }, 'no', false],
    ['eq number', { eq: 1 }, '1', true],
    ['neq', { neq: 'bot' }, 'human', true],
    ['neq', { neq: 'bot' }, 'bot', false],
    ['pre', { pre: '/docs' }, '/docs/a', true],
    ['pre', { pre: '/docs' }, '/blog/a', false],
    ['suf', { suf: '.png' }, '/a.png', true],
    ['suf', { suf: '.png' }, '/a.jpg', false],
    ['inc', { inc: ['a', 'b'] }, 'xxbxx', true],
    ['inc', { inc: ['a', 'b'] }, 'xxx', false],
    ['ninc', { ninc: ['a', 'b'] }, 'xxx', true],
    ['ninc', { ninc: ['a', 'b'] }, 'xxaxx', false],
    ['re', { re: '(?<v>[0-9]+)' }, 'v42', true],
    ['gt', { gt: 2 }, '3', true],
    ['gt', { gt: 2 }, '2', false],
    ['gte', { gte: 2 }, '2', true],
    ['lt', { lt: 2 }, '1', true],
    ['lte', { lte: 2 }, '3', false],
    ['non-numeric', { gt: 2 }, 'abc', false],
  ])('matches object matcher %s', (_name, value, actual, expected) => {
    const has = [{ type: 'query', key: 'q', value }] as HasField;
    const result = matchRouteConditions(
      has,
      undefined,
      ctx({}, { q: [actual as string] })
    );
    expect(result.matched).toBe(expected);
  });

  it('captures named groups from `re` matcher', () => {
    const has: HasField = [
      { type: 'header', key: 'x-v', value: { re: '(?<v>[0-9]+)' } },
    ];
    expect(matchRouteConditions(has, undefined, ctx({ 'x-v': 'v42' }))).toEqual(
      { matched: true, params: { v: '42' } }
    );
  });

  it('requires all matchers in one object to hold', () => {
    const has: HasField = [
      { type: 'query', key: 'q', value: { pre: 'a', suf: 'z' } },
    ];
    expect(
      matchRouteConditions(has, undefined, ctx({}, { q: ['abz'] })).matched
    ).toBe(true);
    expect(
      matchRouteConditions(has, undefined, ctx({}, { q: ['abx'] })).matched
    ).toBe(false);
  });
});

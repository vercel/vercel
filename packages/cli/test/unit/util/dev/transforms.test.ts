import { describe, expect, it } from 'vitest';
import PCRE from 'pcre-to-regexp';
import {
  applyRequestTransforms,
  applyResponseTransforms,
  hasResponseTransforms,
  resolveTransforms,
  type Transform,
} from '../../../../src/util/dev/transforms';

// a simple version of what devRouter does
function buildTransformCtx(
  src: string,
  path: string,
  env?: Record<string, string | undefined>
) {
  const keys: string[] = [];
  const matcher = PCRE(`%${src}%i`, keys);
  const match = matcher.exec(path) || matcher.exec(path.substring(1));
  return { match: match ?? [], keys, env };
}

describe('resolveTransforms', () => {
  it('resolves request.path groups', () => {
    const numbered = resolveTransforms(
      [{ type: 'request.path', op: 'set', args: '/api/$1' }] as Transform[],
      buildTransformCtx('/transform/(.*)', '/transform/echo')
    );
    expect(numbered[0]).toMatchObject({ args: '/api/echo' });

    const named = resolveTransforms(
      [{ type: 'request.path', op: 'set', args: '/posts/$id' }] as Transform[],
      buildTransformCtx('/articles/(?<id>[^/]+)', '/articles/42')
    );
    expect(named[0]).toMatchObject({ args: '/posts/42' });
  });

  it('expands capture groups first, then allowlisted env vars', () => {
    const [resolved] = resolveTransforms(
      [
        {
          type: 'request.path',
          op: 'set',
          args: '/$LOCALE/api/$1',
          env: ['LOCALE'],
        },
      ],
      buildTransformCtx('/transform/(.*)', '/transform/echo', {
        LOCALE: 'en',
        SECRET: 'nope',
      })
    );
    expect(resolved).toMatchObject({ args: '/en/api/echo' });
  });

  it('keeps non-allowlisted env references intact', () => {
    const [resolved] = resolveTransforms(
      [
        {
          type: 'request.headers',
          op: 'set',
          target: { key: 'x-token' },
          args: '$SECRET',
          env: ['ALLOWED'],
        },
      ],
      buildTransformCtx('/x', '/x', { SECRET: 'non-public' })
    );
    expect(resolved).toMatchObject({ args: '$SECRET' });
  });

  it('resolves capture groups inside the target key', () => {
    const [resolved] = resolveTransforms(
      [
        {
          type: 'request.headers',
          op: 'set',
          target: { key: 'x-$1' },
          args: 'v',
        },
      ],
      buildTransformCtx('/h/(.*)', '/h/team')
    );
    expect(resolved).toMatchObject({ target: { key: 'x-team' } });
  });
});

describe('applyRequestTransforms', () => {
  it('overrides the path and preserves the query string', () => {
    const req = { url: '/transform/echo?foo=bar', headers: {} };
    applyRequestTransforms(req, [
      { type: 'request.path', op: 'set', args: '/api/echo' },
    ]);
    expect(req.url).toBe('/api/echo?foo=bar');
  });

  it('applies request.query set/append/delete', () => {
    const req = { url: '/x?keep=1&drop=2', headers: {} };
    applyRequestTransforms(req, [
      { type: 'request.query', op: 'set', target: { key: 'added' }, args: 'a' },
      {
        type: 'request.query',
        op: 'delete',
        target: { key: 'drop' },
      },
    ]);
    expect(req.url).toContain('keep=1');
    expect(req.url).toContain('added=a');
    expect(req.url).not.toContain('drop=2');
  });

  it('applies request.headers set/append/delete', () => {
    const req = {
      url: '/x',
      headers: {
        'x-existing': 'a',
        'x-remove': 'gone',
      } as Record<string, string | string[] | undefined>,
    };
    applyRequestTransforms(req, [
      {
        type: 'request.headers',
        op: 'set',
        target: { key: 'x-new' },
        args: 'n',
      },
      {
        type: 'request.headers',
        op: 'append',
        target: { key: 'x-existing' },
        args: 'b',
      },
      { type: 'request.headers', op: 'delete', target: { key: 'x-remove' } },
    ]);
    expect(req.headers['x-new']).toBe('n');
    expect(req.headers['x-existing']).toEqual(['a', 'b']);
    expect(req.headers['x-remove']).toBeUndefined();
  });
});

describe('request.query', () => {
  const queryOf = (reqUrl: string) =>
    new URLSearchParams(reqUrl.split('?')[1] ?? '');

  it('set creates a param', () => {
    const req = { url: '/x', headers: {} };
    applyRequestTransforms(req, [
      { type: 'request.query', op: 'set', target: { key: 'a' }, args: 'x' },
    ]);
    expect(queryOf(req.url).getAll('a')).toEqual(['x']);
  });

  it('append adds a value to an existing param', () => {
    const req = { url: '/x?a=x', headers: {} };
    applyRequestTransforms(req, [
      { type: 'request.query', op: 'append', target: { key: 'a' }, args: 'y' },
    ]);
    expect(queryOf(req.url).getAll('a')).toEqual(['x', 'y']);
  });

  it('delete with args removes only matching values', () => {
    const req = { url: '/x?a=x&a=y', headers: {} };
    applyRequestTransforms(req, [
      { type: 'request.query', op: 'delete', target: { key: 'a' }, args: 'x' },
    ]);
    expect(queryOf(req.url).getAll('a')).toEqual(['y']);
  });
});

describe('applyResponseTransforms', () => {
  it('set overwrites and creates string keys', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'x-old': 'before',
    };
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'set',
        target: { key: 'x-old' },
        args: 'after',
      },
      {
        type: 'response.headers',
        op: 'set',
        target: { key: 'x-new' },
        args: 'v',
      },
    ]);
    expect(headers['x-old']).toBe('after');
    expect(headers['x-new']).toBe('v');
  });

  it('append splits and rejoins comma-separated header values', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'cache-control': 'public, max-age=0',
    };
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'append',
        target: { key: 'cache-control' },
        args: 'immutable',
      },
    ]);
    expect(headers['cache-control']).toEqual([
      'public',
      'max-age=0',
      'immutable',
    ]);
  });

  it('delete without args drops the header entirely', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'x-drop': 'v',
    };
    applyResponseTransforms(headers, [
      { type: 'response.headers', op: 'delete', target: { key: 'x-drop' } },
    ]);
    expect(headers['x-drop']).toBeUndefined();
  });

  it('matches keys by predicate object (prefix) for delete', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'x-react-router-a': '1',
      'x-react-router-b': '2',
      'x-keep': '3',
    };
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'delete',
        target: { key: { pre: 'x-react-router-' } },
      },
    ]);
    expect(headers['x-react-router-a']).toBeUndefined();
    expect(headers['x-react-router-b']).toBeUndefined();
    expect(headers['x-keep']).toBe('3');
  });

  it('does not create a key when the selector is a predicate object', () => {
    const headers: Record<string, string | string[] | undefined> = {};
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'set',
        target: { key: { pre: 'x-' } },
        args: 'v',
      },
    ]);
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('only applies response.headers transforms', () => {
    const headers: Record<string, string | string[] | undefined> = {};
    applyResponseTransforms(headers, [
      {
        type: 'request.headers',
        op: 'set',
        target: { key: 'x-req' },
        args: 'v',
      },
    ]);
    expect(headers['x-req']).toBeUndefined();
  });
});

describe('key predicate operators', () => {
  function survivorsAfterDelete(
    headers: Record<string, string | string[] | undefined>,
    key: unknown
  ): string[] {
    applyResponseTransforms(headers, [
      { type: 'response.headers', op: 'delete', target: { key } } as Transform,
    ]);
    return Object.keys(headers).sort();
  }

  it('eq matches a single key (case-insensitive)', () => {
    expect(
      survivorsAfterDelete({ 'X-Foo': '1', 'x-bar': '2' }, { eq: 'x-foo' })
    ).toEqual(['x-bar']);
  });

  it('eq coerces a numeric rule to a string key', () => {
    expect(
      survivorsAfterDelete({ '42': '1', 'x-foo': '2' }, { eq: 42 })
    ).toEqual(['x-foo']);
  });

  it('neq matches every key except the given one', () => {
    expect(
      survivorsAfterDelete({ keep: '1', drop: '2' }, { neq: 'keep' })
    ).toEqual(['keep']);
  });

  it('inc matches keys in the list', () => {
    expect(
      survivorsAfterDelete({ a: '1', b: '2', c: '3' }, { inc: ['a', 'c'] })
    ).toEqual(['b']);
  });

  it('ninc matches keys NOT in the list', () => {
    // The in-list key survives; the out-of-list key is deleted.
    expect(
      survivorsAfterDelete({ keep: '1', drop: '2' }, { ninc: ['keep'] })
    ).toEqual(['keep']);
  });

  it('suf matches keys by suffix', () => {
    expect(
      survivorsAfterDelete({ 'a-old': '1', 'a-new': '2' }, { suf: '-old' })
    ).toEqual(['a-new']);
  });

  it('sub matches keys by substring', () => {
    expect(
      survivorsAfterDelete({ 'x-mid-y': '1', 'x-y': '2' }, { sub: 'mid' })
    ).toEqual(['x-y']);
  });

  it('numeric comparisons treat the key name as a number', () => {
    expect(
      survivorsAfterDelete({ '5': '1', '15': '2', foo: '3' }, { gt: 10 })
    ).toEqual(['5', 'foo']);
    expect(survivorsAfterDelete({ '5': '1', '15': '2' }, { lte: 5 })).toEqual([
      '15',
    ]);
  });
});

describe('delete by value pattern', () => {
  it('removes matching values from a comma-separated header', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'cache-control': 'public, no-cache, max-age=0',
    };
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'delete',
        target: { key: 'cache-control' },
        args: 'no-cache',
      },
    ]);
    expect(headers['cache-control']).toEqual(['public', 'max-age=0']);
  });

  it('accepts a list of value patterns and collapses to a single value', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'cache-control': 'public, no-cache, max-age=0',
    };
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'delete',
        target: { key: 'cache-control' },
        args: ['public', 'no-cache'],
      },
    ]);
    expect(headers['cache-control']).toBe('max-age=0');
  });
});

describe('append edge cases', () => {
  it('creates a missing key (literal string selector)', () => {
    const headers: Record<string, string | string[] | undefined> = {};
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'append',
        target: { key: 'x-new' },
        args: 'a',
      },
    ]);
    expect(headers['x-new']).toBe('a');
  });

  it('is a no-op when args are empty', () => {
    const headers: Record<string, string | string[] | undefined> = {
      'x-keep': 'a',
    };
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'append',
        target: { key: 'x-keep' },
        args: '',
      },
    ]);
    expect(headers['x-keep']).toBe('a');
  });

  it('appends multiple values from an array', () => {
    const headers: Record<string, string | string[] | undefined> = {};
    applyResponseTransforms(headers, [
      {
        type: 'response.headers',
        op: 'append',
        target: { key: 'x-multi' },
        args: ['a', 'b'],
      },
    ]);
    expect(headers['x-multi']).toEqual(['a', 'b']);
  });
});

describe('env expansion', () => {
  it('expands the braced env-var syntax for allowlisted vars', () => {
    const [resolved] = resolveTransforms(
      [
        {
          type: 'request.path',
          op: 'set',
          args: `/\${LOCALE}/x`,
          env: ['LOCALE'],
        },
      ],
      buildTransformCtx('/x', '/x', { LOCALE: 'en' })
    );
    expect(resolved).toMatchObject({ args: '/en/x' });
  });

  it('leaves an allowlisted-but-undefined var intact', () => {
    const [resolved] = resolveTransforms(
      [
        {
          type: 'request.path',
          op: 'set',
          args: '/$MISSING/x',
          env: ['MISSING'],
        },
      ],
      buildTransformCtx('/x', '/x', {})
    );
    expect(resolved).toMatchObject({ args: '/$MISSING/x' });
  });
});

describe('hasResponseTransforms', () => {
  it('is true when a response.headers transform is present', () => {
    expect(
      hasResponseTransforms([
        {
          type: 'response.headers',
          op: 'set',
          target: { key: 'x' },
          args: 'v',
        },
      ])
    ).toBe(true);
  });

  it('is false for request-only transforms and empty lists', () => {
    expect(
      hasResponseTransforms([
        {
          type: 'request.headers',
          op: 'set',
          target: { key: 'x' },
          args: 'v',
        },
      ])
    ).toBe(false);
    expect(hasResponseTransforms([])).toBe(false);
  });
});

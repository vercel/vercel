import { describe, it, expect } from 'vitest';

import { getArgsAndQuery } from '../../../src/commands/open';

describe('index', () => {
  it('getArgsAndQuery', () => {
    const { args, query } = getArgsAndQuery([
      'settings',
      '--latest',
      '--foo',
      'bar',
      '--level=warning',
    ]);
    expect(args).toEqual(['settings']);
    expect(query).toEqual({ latest: true, foo: 'bar', level: 'warning' });
  });
});

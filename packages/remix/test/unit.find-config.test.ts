import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { findConfig } from '../src/utils';

const fixture = (name: string) => join(__dirname, 'fixtures-legacy', name);

// Skipping because it doesn't run yet on Node 22
// eslint-disable-next-line jest/no-disabled-tests
describe('findConfig()', () => {
  it.each([
    { name: '01-remix-basics', config: 'remix.config.js' },
    { name: '02-remix-basics-mjs', config: 'remix.config.mjs' },
    { name: '03-with-pnpm', config: 'remix.config.js' },
    { name: '04-with-npm9-linked', config: 'remix.config.js' },
  ])('should find `$config` from "$name"', ({ name, config }) => {
    const dir = fixture(name);
    const resolved = findConfig(dir, 'remix.config');
    expect(resolved).toEqual(join(dir, config));
  });
});

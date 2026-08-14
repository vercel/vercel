import type {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from 'vitest';

declare global {
  const afterAll: typeof afterAll;
  const afterEach: typeof afterEach;
  const beforeAll: typeof beforeAll;
  const beforeEach: typeof beforeEach;
  const describe: typeof describe;
  const expect: typeof expect;
  const it: typeof it;
  const test: typeof test;
  const vi: typeof vi;
}


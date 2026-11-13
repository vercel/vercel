import { describe, test, expect } from 'vitest';
import { getPackageManagerNameFromDevEngines } from '../src/fs/run-user-scripts';

describe('Test `getPackageManagerNameFromDevEngines()`', () => {
  test.each<{
    name: string;
    input: Parameters<typeof getPackageManagerNameFromDevEngines>[0];
    want: ReturnType<typeof getPackageManagerNameFromDevEngines>;
  }>([
    {
      name: 'returns undefined when `devEngines.packageManager` is undefined',
      input: undefined,
      want: undefined,
    },
    {
      name: 'returns the name from a single object entry',
      input: { name: 'pnpm', version: '^11.0.0', onFail: 'error' },
      want: 'pnpm',
    },
    {
      name: 'returns the first recognized name from an array entry',
      input: [
        { name: 'pnpm', version: '^11.0.0', onFail: 'error' },
        { name: 'yarn', version: '^4.0.0' },
      ],
      want: 'pnpm',
    },
    {
      name: 'skips unrecognized names in an array and returns the next recognized one',
      input: [
        { name: 'deno', version: '^2.0.0' },
        { name: 'bun', version: '^1.0.0' },
      ],
      want: 'bun',
    },
    {
      name: 'returns undefined when the name is unrecognized',
      input: { name: 'deno', version: '^2.0.0' },
      want: undefined,
    },
    {
      name: 'returns undefined when the name is missing',
      input: { version: '^11.0.0' },
      want: undefined,
    },
    {
      name: 'returns undefined for an empty array',
      input: [],
      want: undefined,
    },
  ])('$name', ({ input, want }) => {
    expect(getPackageManagerNameFromDevEngines(input)).toEqual(want);
  });
});

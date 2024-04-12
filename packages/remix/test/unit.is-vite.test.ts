import { join } from 'path';
import { readdirSync } from 'fs';
import { isVite } from '../src/utils';

describe('isVite()', () => {
  it.each([
    ...readdirSync(join(__dirname, 'fixtures-legacy')).map(name => ({
      name: join('fixtures-legacy', name),
      expected: false,
    })),
    ...readdirSync(join(__dirname, 'fixtures-vite')).map(name => ({
      name: join('fixtures-vite', name),
      expected: true,
    })),
    {
      name: 'fixtures-unit/by-build-command',
      expected: true,
    },
    {
      name: 'fixtures-unit/by-vite-config',
      expected: true,
    },
    {
      name: 'fixtures-unit/by-vite-config-legacy',
      expected: false,
    },
  ])('should return `$expected` for "$name" route', ({ name, expected }) => {
    expect(isVite(join(__dirname, name))).toEqual(expected);
  });
});

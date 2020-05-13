import path from 'path';
import { existsSync } from 'fs';
import { Framework } from '../';

function isString(arg: any): arg is string {
  return typeof arg === 'string';
}

describe('frameworks', () => {
  it('ensure there is an example for every framework', async () => {
    const root = path.join(__dirname, '..', '..', '..');
    const getExample = (name: string) => path.join(root, 'examples', name);

    const frameworks = require('../frameworks.json') as Framework[];

    const result = frameworks
      .map(f => f.slug)
      .filter(isString)
      .filter(f => existsSync(getExample(f)) === false);

    expect(result).toEqual([]);
  });
});

//import assert from 'assert';
import { join } from 'path';
import { prepareCache } from '../src';

const fixture = (name: string) => join(__dirname, 'fixtures', name);

describe('prepareCache()', () => {
  jest.setTimeout(10 * 60 * 1000);

  it('should build fixture "01-remix-basics"', async () => {
    const workPath = fixture('01-remix-basics');
    const result = await prepareCache({
      files: {},
      entrypoint: 'package.json',
      workPath,
      config: {},
    });
    const names = Object.keys(result);

    // Assert `node_modules` was cached
    const nodeModulesFiles = names.filter(name =>
      name.startsWith('node_modules/')
    );
    expect(nodeModulesFiles.length).toBeGreaterThan(10);
  });
});

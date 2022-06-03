import assert from 'assert';
import { join } from 'path';
import { NodejsLambda } from '@vercel/build-utils';
import { build, prepareCache } from '../src';

jest.setTimeout(10 * 60 * 1000);

const fixture = (name: string) => join(__dirname, 'fixtures', name);

describe('build()', () => {
  it('should build fixture "01-remix-basics"', async () => {
    if (process.platform === 'win32') {
      // Fails on Windows (https://github.com/vercel/vercel/runs/6484955910):
      // > 'remix' is not recognized as an internal or external command,
      console.log('Skipping test on Windows.');
      return;
    }
    const workPath = fixture('01-remix-basics');
    const result = await build({
      files: {},
      entrypoint: 'package.json',
      workPath,
      repoRootPath: workPath,
      config: {},
    });
    assert('output' in result);
    const names = Object.keys(result.output);

    expect('favicon.ico' in result.output).toEqual(true);
    expect(names.filter(n => n.startsWith('build/')).length).toBeGreaterThan(5);

    const render = result.output.render;
    expect(render.type).toEqual('Lambda');
    expect((render as NodejsLambda).launcherType).toEqual('Nodejs');

    const cache = await prepareCache({
      files: {},
      entrypoint: 'package.json',
      workPath,
      repoRootPath: workPath,
      config: {},
    });
    const cacheNames = Object.keys(cache);

    // Assert `node_modules` was cached
    const nodeModulesFiles = cacheNames.filter(n =>
      n.startsWith('node_modules/')
    );
    expect(nodeModulesFiles.length).toBeGreaterThanOrEqual(10);

    // Assert `.cache` was cached
    const dotCacheFiles = cacheNames.filter(n => n.startsWith('.cache/'));
    expect(dotCacheFiles.length).toBeGreaterThanOrEqual(4);
  });
});

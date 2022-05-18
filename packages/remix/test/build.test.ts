import assert from 'assert';
import { join } from 'path';
import { NodejsLambda } from '@vercel/build-utils';
import { build } from '../src';

const fixture = (name: string) => join(__dirname, 'fixtures', name);

describe('build()', () => {
  jest.setTimeout(10 * 60 * 1000);

  it('should build fixture "01-remix-basics"', async () => {
    const workPath = fixture('01-remix-basics');
    const result = await build({
      files: {},
      entrypoint: 'package.json',
      workPath,
      config: {},
    });
    console.log(result);
    assert('output' in result);
    const names = Object.keys(result.output);

    expect('favicon.ico' in result.output).toEqual(true);
    expect(names.filter(n => n.startsWith('build/')).length).toBeGreaterThan(5);

    const render = result.output.render;
    expect(render.type).toEqual('Lambda');
    expect((render as NodejsLambda).launcherType).toEqual('Nodejs');
  });
});

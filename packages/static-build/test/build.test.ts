import path from 'path';
import { build } from '../src';

describe('build()', () => {
  it('should detect Builder Output v3', async () => {
    const workPath = path.join(
      __dirname,
      'build-fixtures',
      '09-build-output-v3'
    );
    const buildResult = await build({
      files: {},
      entrypoint: 'package.json',
      workPath,
      config: {},
      meta: {
        skipDownload: true,
        cliVersion: '0.0.0',
      },
    });
    if ('output' in buildResult) {
      throw new Error('Unexpected `output` in build result');
    }
    expect(buildResult.buildOutputVersion).toEqual(3);
    expect(buildResult.buildOutputPath).toEqual(
      path.join(workPath, '.vercel/output')
    );
  });

  it('should throw an Error with Builder Output v3 without `vercel build`', async () => {
    let err;
    const workPath = path.join(
      __dirname,
      'build-fixtures',
      '09-build-output-v3'
    );
    try {
      await build({
        files: {},
        entrypoint: 'package.json',
        workPath,
        config: {},
        meta: {
          skipDownload: true,
        },
      });
    } catch (_err: any) {
      err = _err;
    }
    expect(err.message).toEqual(
      `Detected Build Output v3 from the "build" script, but this Deployment is not using \`vercel build\`.\nPlease set the \`ENABLE_VC_BUILD=1\` environment variable.`
    );
  });
});

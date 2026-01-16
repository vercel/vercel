import { join } from 'path';
import { build } from '../src/index';
import { FileFsRef } from '@vercel/build-utils';

describe('wrapper mode go.mod dependencies', () => {
  it('should build with external dependencies', async () => {
    const fixturePath = join(__dirname, 'fixtures/wrapper-11-go-mod');
    const workPath = fixturePath;
    const entrypoint = 'index.go';

    const buildOptions: any = {
      files: {
        'index.go': new FileFsRef({ fsPath: join(fixturePath, 'index.go') }),
        'go.mod': new FileFsRef({ fsPath: join(fixturePath, 'go.mod') }),
        'go.sum': new FileFsRef({ fsPath: join(fixturePath, 'go.sum') }),
      },
      entrypoint,
      workPath,
      config: {
        wrapper: true,
      },
      meta: {
        skipDownload: true,
      },
    };

    const result = await build(buildOptions);
    const lambda = result.output as any;

    expect(lambda).toBeDefined();
    expect(lambda.files).toBeDefined();
    // We expect the lambda to be created successfully.
    // The actual verification of the dependency working would be at runtime,
    // but a successful build implies dependencies were resolved and compiled.
  }, 120000);
});

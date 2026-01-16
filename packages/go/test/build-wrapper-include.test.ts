import { join } from 'path';
import { build } from '../src/index';
import { FileFsRef } from '@vercel/build-utils';

describe('wrapper mode includeFiles', () => {
  it('should include files defined in includeFiles', async () => {
    const fixturePath = join(__dirname, 'fixtures/wrapper-10-include-files');
    const workPath = fixturePath;
    const entrypoint = 'index.go';

    const buildOptions: any = {
      files: {
        'index.go': new FileFsRef({ fsPath: join(fixturePath, 'index.go') }),
        'go.mod': new FileFsRef({ fsPath: join(fixturePath, 'go.mod') }),
        'templates/hello.txt': new FileFsRef({
          fsPath: join(fixturePath, 'templates/hello.txt'),
        }),
      },
      entrypoint,
      workPath,
      config: {
        wrapper: true,
        includeFiles: ['templates/**'],
      },
      meta: {
        skipDownload: true, // We provided files as FileFsRef with fsPath, but build() downloads them.
        // If we skip download, it uses workPath.
      },
    };

    const result = await build(buildOptions);
    const lambda = result.output as any;

    expect(lambda.files).toBeDefined();
    expect(lambda.files['templates/hello.txt']).toBeDefined();
  }, 60000);
});

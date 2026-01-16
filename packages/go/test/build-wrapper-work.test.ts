import { join } from 'path';
import { build } from '../src/index';
import { FileFsRef } from '@vercel/build-utils';

describe('wrapper mode go.work workspaces', () => {
  it('should build with go.work', async () => {
    const fixturePath = join(__dirname, 'fixtures/wrapper-12-go-work');
    const workPath = fixturePath;
    const entrypoint = 'app/index.go';

    const buildOptions: any = {
      files: {
        'go.work': new FileFsRef({ fsPath: join(fixturePath, 'go.work') }),
        'app/go.mod': new FileFsRef({
          fsPath: join(fixturePath, 'app/go.mod'),
        }),
        'app/index.go': new FileFsRef({
          fsPath: join(fixturePath, 'app/index.go'),
        }),
        'shared/go.mod': new FileFsRef({
          fsPath: join(fixturePath, 'shared/go.mod'),
        }),
        'shared/shared.go': new FileFsRef({
          fsPath: join(fixturePath, 'shared/shared.go'),
        }),
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
  }, 120000);
});

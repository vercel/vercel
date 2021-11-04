import { join } from 'path';
import { readFile, remove } from 'fs-extra';
import { BuildOptions, createLambda } from '../src';
import { convertRuntimeToPlugin } from '../src/convert-runtime-to-plugin';

const workPath = join(__dirname, 'walk', 'python-api');

describe('convert-runtime-to-plugin', () => {
  afterEach(async () => {
    await remove(join(workPath, '.output'));
  });

  it('should create correct fileystem for python', async () => {
    const buildRuntime = async (opts: BuildOptions) => {
      const lambda = await createLambda({
        files: opts.files,
        handler: 'index.handler',
        runtime: 'python3.9',
      });
      return { output: lambda };
    };

    const build = await convertRuntimeToPlugin(buildRuntime, '.py');
    await build({ workPath });
    const apiDir = join(workPath, '.output', 'server', 'pages', 'api');

    const indexJson = await readFile(join(apiDir, 'index.nft.json'), 'utf8');
    expect(JSON.parse(indexJson)).toMatchObject({
      version: 1,
      files: [
        {
          input: '../../../../inputs/runtime-temp/api/index.py',
          output: 'api/index.py',
        },
        {
          input: '../../../../inputs/runtime-temp/api/users/get.py',
          output: 'api/users/get.py',
        },
        {
          input: '../../../../inputs/runtime-temp/api/users/post.py',
          output: 'api/users/post.py',
        },
        {
          input: '../../../../inputs/runtime-temp/file.txt',
          output: 'file.txt',
        },
        {
          input: '../../../../inputs/runtime-temp/util/date.py',
          output: 'util/date.py',
        },
        {
          input: '../../../../inputs/runtime-temp/util/math.py',
          output: 'util/math.py',
        },
      ],
    });

    const getJson = await readFile(
      join(apiDir, 'users', 'get.nft.json'),
      'utf8'
    );
    expect(JSON.parse(getJson)).toMatchObject({
      version: 1,
      files: [
        {
          input: '../../../../../inputs/runtime-temp/api/index.py',
          output: 'api/index.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/api/users/get.py',
          output: 'api/users/get.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/api/users/post.py',
          output: 'api/users/post.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/file.txt',
          output: 'file.txt',
        },
        {
          input: '../../../../../inputs/runtime-temp/util/date.py',
          output: 'util/date.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/util/math.py',
          output: 'util/math.py',
        },
      ],
    });

    const postJson = await readFile(
      join(apiDir, 'users', 'post.nft.json'),
      'utf8'
    );
    expect(JSON.parse(postJson)).toMatchObject({
      version: 1,
      files: [
        {
          input: '../../../../../inputs/runtime-temp/api/index.py',
          output: 'api/index.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/api/users/get.py',
          output: 'api/users/get.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/api/users/post.py',
          output: 'api/users/post.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/file.txt',
          output: 'file.txt',
        },
        {
          input: '../../../../../inputs/runtime-temp/util/date.py',
          output: 'util/date.py',
        },
        {
          input: '../../../../../inputs/runtime-temp/util/math.py',
          output: 'util/math.py',
        },
      ],
    });
  });
});

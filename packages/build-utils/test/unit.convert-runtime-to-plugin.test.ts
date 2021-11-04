import { join } from 'path';
import { readFile } from 'fs-extra';
import { BuildOptions, createLambda } from '../src';
import { convertRuntimeToPlugin } from '../src/convert-runtime-to-plugin';

it('should create correct fileystem for python', async () => {
  const workPath = join(__dirname, 'walk', 'python-api');

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
  //const getJson = await readFile(join(apiDir, 'users', 'get.nft.json'), 'utf8');
  //const postJson = await readFile(join(apiDir, 'users', 'post.nft.json'), 'utf8');
  expect(JSON.parse(indexJson)).toEqual({
    version: 1,
    files: [
      {
        input: '../../index.py',
        output: 'index.py',
      },
    ],
  });
});

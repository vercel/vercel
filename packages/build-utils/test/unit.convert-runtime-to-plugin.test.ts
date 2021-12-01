import { join } from 'path';
import fs from 'fs-extra';
import { BuildOptions, createLambda } from '../src';
import { convertRuntimeToPlugin } from '../src/convert-runtime-to-plugin';

async function fsToJson(dir: string, output: Record<string, any> = {}) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const fsPath = join(dir, file);
    const stat = await fs.stat(fsPath);
    if (stat.isDirectory()) {
      output[file] = {};
      await fsToJson(fsPath, output[file]);
    } else {
      output[file] = await fs.readFile(fsPath, 'utf8');
    }
  }
  return output;
}

const invalidFuncWorkpath = join(
  __dirname,
  'convert-runtime',
  'invalid-functions'
);
const pythonApiWorkpath = join(__dirname, 'convert-runtime', 'python-api');

describe('convert-runtime-to-plugin', () => {
  afterEach(async () => {
    await fs.remove(join(invalidFuncWorkpath, '.output'));
    await fs.remove(join(pythonApiWorkpath, '.output'));
  });

  it('should create correct fileystem for python', async () => {
    const workPath = pythonApiWorkpath;
    const lambdaOptions = {
      handler: 'index.handler',
      runtime: 'python3.9',
      memory: 512,
      maxDuration: 5,
      environment: {},
    };

    const buildRuntime = async (opts: BuildOptions) => {
      const lambda = await createLambda({
        files: opts.files,
        ...lambdaOptions,
      });
      return { output: lambda };
    };

    const lambdaFiles = await fsToJson(workPath);
    delete lambdaFiles['vercel.json'];

    const ext = '.py';
    const packageName = 'vercel-plugin-python';
    const build = await convertRuntimeToPlugin(buildRuntime, packageName, ext);

    await build({ workPath });

    const output = await fsToJson(join(workPath, '.output'));

    expect(output).toMatchObject({
      'functions-manifest.json': expect.stringContaining('{'),
      inputs: {
        'api-routes-python': lambdaFiles,
      },
      server: {
        pages: {
          api: {
            'index.py': expect.stringContaining('index'),
            'index.py.nft.json': expect.stringContaining('{'),
            users: {
              'get.py': expect.stringContaining('get'),
              'get.py.nft.json': expect.stringContaining('{'),
              'post.py': expect.stringContaining('post'),
              'post.py.nft.json': expect.stringContaining('{'),
            },
          },
        },
      },
    });

    const funcManifest = JSON.parse(output['functions-manifest.json']);
    expect(funcManifest).toMatchObject({
      version: 1,
      pages: {
        'api/index.py': lambdaOptions,
        'api/users/get.py': lambdaOptions,
        'api/users/post.py': { ...lambdaOptions, memory: 512 },
      },
    });

    const indexJson = JSON.parse(output.server.pages.api['index.py.nft.json']);
    expect(indexJson).toMatchObject({
      version: 1,
      files: [
        {
          input: `../../../../inputs/api-routes-python/api/db/[id].py`,
          output: 'api/db/[id].py',
        },
        {
          input: `../../../../inputs/api-routes-python/api/index.py`,
          output: 'api/index.py',
        },
        {
          input: `../../../../inputs/api-routes-python/api/project/[aid]/[bid]/index.py`,
          output: 'api/project/[aid]/[bid]/index.py',
        },
        {
          input: `../../../../inputs/api-routes-python/api/users/get.py`,
          output: 'api/users/get.py',
        },
        {
          input: `../../../../inputs/api-routes-python/api/users/post.py`,
          output: 'api/users/post.py',
        },
        {
          input: `../../../../inputs/api-routes-python/file.txt`,
          output: 'file.txt',
        },
        {
          input: `../../../../inputs/api-routes-python/util/date.py`,
          output: 'util/date.py',
        },
        {
          input: `../../../../inputs/api-routes-python/util/math.py`,
          output: 'util/math.py',
        },
      ],
    });

    const getJson = JSON.parse(
      output.server.pages.api.users['get.py.nft.json']
    );
    expect(getJson).toMatchObject({
      version: 1,
      files: [
        {
          input: `../../../../../inputs/api-routes-python/api/db/[id].py`,
          output: 'api/db/[id].py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/index.py`,
          output: 'api/index.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/project/[aid]/[bid]/index.py`,
          output: 'api/project/[aid]/[bid]/index.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/users/get.py`,
          output: 'api/users/get.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/users/post.py`,
          output: 'api/users/post.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/file.txt`,
          output: 'file.txt',
        },
        {
          input: `../../../../../inputs/api-routes-python/util/date.py`,
          output: 'util/date.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/util/math.py`,
          output: 'util/math.py',
        },
      ],
    });

    const postJson = JSON.parse(
      output.server.pages.api.users['post.py.nft.json']
    );
    expect(postJson).toMatchObject({
      version: 1,
      files: [
        {
          input: `../../../../../inputs/api-routes-python/api/db/[id].py`,
          output: 'api/db/[id].py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/index.py`,
          output: 'api/index.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/project/[aid]/[bid]/index.py`,
          output: 'api/project/[aid]/[bid]/index.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/users/get.py`,
          output: 'api/users/get.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/api/users/post.py`,
          output: 'api/users/post.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/file.txt`,
          output: 'file.txt',
        },
        {
          input: `../../../../../inputs/api-routes-python/util/date.py`,
          output: 'util/date.py',
        },
        {
          input: `../../../../../inputs/api-routes-python/util/math.py`,
          output: 'util/math.py',
        },
      ],
    });

    expect(output.server.pages['file.txt']).toBeUndefined();
    expect(output.server.pages.api['file.txt']).toBeUndefined();
  });
});

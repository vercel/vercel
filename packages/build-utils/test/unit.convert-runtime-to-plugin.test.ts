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

const workPath = join(__dirname, 'walk', 'python-api');

describe('convert-runtime-to-plugin', () => {
  afterEach(async () => {
    await fs.remove(join(workPath, '.output'));
  });

  it('should create correct fileystem for python', async () => {
    const lambdaOptions = {
      handler: 'index.handler',
      runtime: 'python3.9',
      memory: 512,
      maxDuration: 5,
      environment: {},
      regions: ['sfo1'],
    };

    const buildRuntime = async (opts: BuildOptions) => {
      const lambda = await createLambda({
        files: opts.files,
        ...lambdaOptions,
      });
      return { output: lambda };
    };

    const lambdaFiles = await fsToJson(workPath);
    const vercelConfig = JSON.parse(lambdaFiles['vercel.json']);
    delete lambdaFiles['vercel.json'];
    const build = await convertRuntimeToPlugin(buildRuntime, '.py');

    await build({ vercelConfig, workPath });

    const output = await fsToJson(join(workPath, '.output'));
    expect(output).toMatchObject({
      'functions-manifest.json': expect.stringContaining('{'),
      'runtime-traced-files': lambdaFiles,
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
        'api/users/post.py': { ...lambdaOptions, memory: 3008 },
      },
    });

    const indexJson = JSON.parse(output.server.pages.api['index.py.nft.json']);
    expect(indexJson).toMatchObject({
      version: 1,
      files: [
        {
          input: '../../../../runtime-traced-files/api/index.py',
          output: 'api/index.py',
        },
        {
          input: '../../../../runtime-traced-files/api/users/get.py',
          output: 'api/users/get.py',
        },
        {
          input: '../../../../runtime-traced-files/api/users/post.py',
          output: 'api/users/post.py',
        },
        {
          input: '../../../../runtime-traced-files/file.txt',
          output: 'file.txt',
        },
        {
          input: '../../../../runtime-traced-files/util/date.py',
          output: 'util/date.py',
        },
        {
          input: '../../../../runtime-traced-files/util/math.py',
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
          input: '../../../../../runtime-traced-files/api/index.py',
          output: 'api/index.py',
        },
        {
          input: '../../../../../runtime-traced-files/api/users/get.py',
          output: 'api/users/get.py',
        },
        {
          input: '../../../../../runtime-traced-files/api/users/post.py',
          output: 'api/users/post.py',
        },
        {
          input: '../../../../../runtime-traced-files/file.txt',
          output: 'file.txt',
        },
        {
          input: '../../../../../runtime-traced-files/util/date.py',
          output: 'util/date.py',
        },
        {
          input: '../../../../../runtime-traced-files/util/math.py',
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
          input: '../../../../../runtime-traced-files/api/index.py',
          output: 'api/index.py',
        },
        {
          input: '../../../../../runtime-traced-files/api/users/get.py',
          output: 'api/users/get.py',
        },
        {
          input: '../../../../../runtime-traced-files/api/users/post.py',
          output: 'api/users/post.py',
        },
        {
          input: '../../../../../runtime-traced-files/file.txt',
          output: 'file.txt',
        },
        {
          input: '../../../../../runtime-traced-files/util/date.py',
          output: 'util/date.py',
        },
        {
          input: '../../../../../runtime-traced-files/util/math.py',
          output: 'util/math.py',
        },
      ],
    });

    expect(output.server.pages['file.txt']).toBeUndefined();
    expect(output.server.pages.api['file.txt']).toBeUndefined();
  });
});

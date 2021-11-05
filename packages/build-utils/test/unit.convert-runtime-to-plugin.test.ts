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
    const build = await convertRuntimeToPlugin(buildRuntime, '.py');

    await build({ workPath });

    const result = await fsToJson(join(workPath, '.output'));

    expect(result).toMatchObject({
      'functions-manifest.json': expect.stringContaining('python3.9'),
      server: {
        pages: {
          api: {
            index: lambdaFiles,
            users: {
              get: {
                index: lambdaFiles,
              },
              post: {
                index: lambdaFiles,
              },
            },
          },
        },
      },
    });

    const manifest = JSON.parse(result['functions-manifest.json']);

    expect(manifest).toMatchObject({
      'api/index.py': lambdaOptions,
      'api/users/get.py': lambdaOptions,
      'api/users/post.py': { ...lambdaOptions, memory: 3008 },
    });
  });
});

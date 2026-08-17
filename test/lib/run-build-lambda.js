const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const json5 = require('json5');
const { glob } = require('@vercel/build-utils');

exports.createRunBuildLambda = function (builder) {
  // Track every workPath we create so they can be deleted once tests are
  // done with them. Without this, each build leaks a full Next.js build
  // (node_modules + .next output) into os.tmpdir(), which exhausts the
  // ~14 GB free disk on GitHub-hosted runners during long e2e chunks.
  const testScopedDirs = [];
  const hookScopedDirs = [];
  let insideTest = false;

  const remove = async dirs => {
    await Promise.all(
      dirs.splice(0).map(dir =>
        fs.remove(dir).catch(() => {
          /* best-effort cleanup */
        })
      )
    );
  };

  if (typeof beforeEach !== 'undefined') {
    beforeEach(() => {
      insideTest = true;
    });
  }
  if (typeof afterEach !== 'undefined') {
    afterEach(async () => {
      insideTest = false;
      await remove(testScopedDirs);
    });
  }
  if (typeof afterAll !== 'undefined') {
    afterAll(async () => {
      await remove(hookScopedDirs);
      await remove(testScopedDirs);
    });
  }

  return async inputPath => {
    const inputFiles = await glob('**', inputPath);
    const nowJsonRef = inputFiles['vercel.json'] || inputFiles['now.json'];

    if (typeof expect !== 'undefined') {
      expect(nowJsonRef).toBeDefined();
    }
    const nowJson = json5.parse(await fs.readFile(nowJsonRef.fsPath, 'utf8'));
    const build = nowJson.builds[0];

    if (typeof expect !== 'undefined') {
      expect(build.src.includes('*')).toBeFalsy();
    }
    const entrypoint = build.src.replace(/^\//, ''); // strip leftmost slash

    if (typeof expect !== 'undefined') {
      expect(inputFiles[entrypoint]).toBeDefined();
    }
    let workPath = path.join(
      os.tmpdir(),
      `vercel-${Date.now()}-${Math.floor(Math.random() * 100)}`
    );
    await fs.ensureDir(workPath);

    workPath = await fs.realpath(workPath);
    (insideTest ? testScopedDirs : hookScopedDirs).push(workPath);
    console.log('building in', workPath);

    const buildResult = await builder.build({
      files: inputFiles,
      entrypoint,
      config: {
        ...build.config,
        ...(nowJson.functions && { functions: nowJson.functions }),
      },
      workPath,
    });
    const { output } = buildResult;

    // Windows support
    if (output) {
      buildResult.output = Object.keys(output).reduce(
        (result, path) => ({
          ...result,
          [path.replace(/\\/g, '/')]: output[path],
        }),
        {}
      );
    }

    return {
      buildResult,
      workPath,
    };
  };
};

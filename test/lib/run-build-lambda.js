const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const json5 = require('json5');
const { glob } = require('@vercel/build-utils');

exports.createRunBuildLambda = function (builder) {
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
    console.log('building in', workPath);

    const buildResult = await builder.build({
      files: inputFiles,
      entrypoint,
      config: build.config,
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

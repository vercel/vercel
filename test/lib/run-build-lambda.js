const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const json5 = require('json5');
const { glob } = require('@vercel/build-utils');

function runAnalyze(wrapper, context) {
  if (wrapper.analyze) {
    return wrapper.analyze(context);
  }

  return 'this-is-a-fake-analyze-result-from-default-analyze';
}

async function runBuildLambda(inputPath) {
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
  inputFiles[entrypoint].digest =
    'this-is-a-fake-digest-for-non-default-analyze';
  const wrapper = require(build.use);

  const analyzeResult = runAnalyze(wrapper, {
    files: inputFiles,
    entrypoint,
    config: build.config,
  });

  let workPath = path.join(
    os.tmpdir(),
    `vercel-${Date.now()}-${Math.floor(Math.random() * 100)}`
  );
  await fs.ensureDir(workPath);

  workPath = await fs.realpath(workPath);
  console.log('building in', workPath);

  const buildResult = await wrapper.build({
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
    analyzeResult,
    buildResult,
    workPath,
  };
}

module.exports = runBuildLambda;

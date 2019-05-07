/* global expect */
const getWritableDirectory = require('../../packages/now-build-utils/fs/get-writable-directory.js');
const glob = require('../../packages/now-build-utils/fs/glob.js');

function runAnalyze(wrapper, context) {
  if (wrapper.analyze) {
    return wrapper.analyze(context);
  }

  return 'this-is-a-fake-analyze-result-from-default-analyze';
}

async function runBuildLambda(inputPath) {
  const inputFiles = await glob('**', inputPath);
  const nowJsonRef = inputFiles['now.json'];
  expect(nowJsonRef).toBeDefined();
  const nowJson = require(nowJsonRef.fsPath);
  expect(nowJson.builds.length).toBe(1);
  const build = nowJson.builds[0];
  expect(build.src.includes('*')).toBeFalsy();
  const entrypoint = build.src.replace(/^\//, ''); // strip leftmost slash
  expect(inputFiles[entrypoint]).toBeDefined();
  inputFiles[entrypoint].digest = 'this-is-a-fake-digest-for-non-default-analyze';
  const wrapper = require(build.use);

  const analyzeResult = runAnalyze(wrapper, {
    files: inputFiles,
    entrypoint,
    config: build.config,
  });

  const workPath = await getWritableDirectory();
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
      {},
    );
  }

  return {
    analyzeResult,
    buildResult,
  };
}

module.exports = runBuildLambda;

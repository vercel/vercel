const { createBuildResult } = require('../src/index');

function getBuildOutputV2(result) {
  expect(result.resultVersion).toBe(2);
  return result.result;
}

function getBuildOutputV3(result) {
  expect(result.resultVersion).toBe(3);
  return result.result;
}

describe('createBuildResult', () => {
  it('returns a v2 result for rails framework builds', () => {
    const output = { type: 'Lambda' };
    const result = createBuildResult({
      framework: 'rails',
      configuredEntrypoint: 'config.ru',
      output,
    });

    const v2 = getBuildOutputV2(result);
    expect(v2.output).toEqual({ config: output });
    expect(v2.routes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/config' },
    ]);
  });

  it('uses the configured entrypoint for rails routes', () => {
    const output = { type: 'Lambda' };
    const result = createBuildResult({
      framework: 'rails',
      configuredEntrypoint: 'app/config.ru',
      output,
    });

    const v2 = getBuildOutputV2(result);
    expect(v2.output).toEqual({ 'app/config': output });
    expect(v2.routes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/app/config' },
    ]);
  });

  it('returns a v3 result for generic ruby builds', () => {
    const output = { type: 'Lambda' };
    const result = createBuildResult({
      framework: 'ruby',
      configuredEntrypoint: 'config.ru',
      output,
    });

    const v3 = getBuildOutputV3(result);
    expect(v3.output).toBe(output);
  });
});

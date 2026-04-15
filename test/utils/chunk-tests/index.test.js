const { applyFastLaneRunnerOptions } = require('../../../utils/chunk-tests');

describe('applyFastLaneRunnerOptions', () => {
  const originalFastLane = process.env.FAST_LANE;

  afterEach(() => {
    process.env.FAST_LANE = originalFastLane;
  });

  it('returns original options when FAST_LANE is disabled', () => {
    process.env.FAST_LANE = 'false';

    const options = {
      min: 1,
      max: 7,
      testScript: 'test',
      runners: ['ubuntu-latest', 'macos-14', 'windows-latest'],
      nodeVersions: ['20', '22', '24'],
    };

    expect(applyFastLaneRunnerOptions(options)).toEqual(options);
  });

  it('reduces runners and node versions when FAST_LANE is enabled', () => {
    process.env.FAST_LANE = 'true';

    const options = {
      min: 1,
      max: 7,
      testScript: 'test',
      runners: ['ubuntu-latest', 'macos-14', 'windows-latest'],
      nodeVersions: ['20', '22', '24'],
    };

    expect(applyFastLaneRunnerOptions(options)).toEqual({
      ...options,
      runners: ['ubuntu-latest'],
      nodeVersions: ['22'],
    });
  });
});

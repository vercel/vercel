const {
  classifyFailure,
} = require('../../../utils/should-retry-ci-test-failure');

describe('classifyFailure', () => {
  it('retries network transport failures', () => {
    const result = classifyFailure(
      'request failed with ECONNRESET from upstream'
    );
    expect(result).toEqual({
      shouldRetry: true,
      reason: 'network transport error',
    });
  });

  it('retries preview deployment lookup failures', () => {
    const result = classifyFailure(
      'No Vercel preview deployment found for any commit in this PR.'
    );
    expect(result).toEqual({
      shouldRetry: true,
      reason: 'preview deployment lookup timeout/failure',
    });
  });

  it('retries tarball fetch failures', () => {
    const result = classifyFailure(
      'failed to download from /tarballs/vercel.tgz: Gateway Timeout'
    );
    expect(result).toEqual({
      shouldRetry: true,
      reason: 'tarball fetch/transient HTTP failure',
    });
  });

  it('does not retry deterministic assertion failures', () => {
    const result = classifyFailure(
      'Test Suites: 1 failed, 10 passed\nExpected: 2\nReceived: 1'
    );
    expect(result).toEqual({
      shouldRetry: false,
      reason: 'non-transient failure signature',
    });
  });
});

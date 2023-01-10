import { getEnvTargetRequested } from '../../../../src/util/env/env-target';
import { Output } from '../../../../src/util/output';

describe('parseEnvTarget', () => {
  let output: Output;

  beforeEach(() => {
    output = new Output();
    output.warn = jest.fn();
    output.error = jest.fn();
  });

  it('defaults to arg', () => {
    try {
      process.env.VERCEL_ENV = 'some-env';
      const result = getEnvTargetRequested(
        output,
        'some-default-env',
        'some-env'
      );
      expect(result).toEqual('some-env');
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  it('use VERCEL_ENV when no arg', () => {
    try {
      process.env.VERCEL_ENV = 'some-env';
      const result = getEnvTargetRequested(
        output,
        'some-default-env',
        undefined
      );
      expect(result).toEqual('some-env');
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  it('uses default', () => {
    const result = getEnvTargetRequested(output, 'some-default-env', undefined);
    expect(result).toEqual('some-default-env');
  });
});

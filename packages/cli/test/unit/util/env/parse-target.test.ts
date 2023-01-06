import { getEnvTargetRequested } from '../../../../src/util/env/env-target';
import { Output } from '../../../../src/util/output';

describe('parseEnvTarget', () => {
  let output: Output;

  beforeEach(() => {
    output = new Output();
    output.warn = jest.fn();
    output.error = jest.fn();
  });

  it('defaults to `development`', () => {
    delete process.env.VERCEL_ENV;
    let result = getEnvTargetRequested(output);
    expect(result).toEqual('development');
  });

  it('defaults to defaultEnv', () => {
    delete process.env.VERCEL_ENV;
    let result = getEnvTargetRequested(output, undefined, 'staging');
    expect(result).toEqual('staging');
  });

  it('defaults to arg', () => {
    try {
      process.env.VERCEL_ENV = 'some-env';
      const result = getEnvTargetRequested(output, 'arg-env');
      expect(result).toEqual('arg-env');
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  it('use VERCEL_ENV when no arg', () => {
    try {
      process.env.VERCEL_ENV = 'some-env';
      const result = getEnvTargetRequested(output);
      expect(result).toEqual('some-env');
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });
});

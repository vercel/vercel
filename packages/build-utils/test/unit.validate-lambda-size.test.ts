import { describe, expect, it } from 'vitest';
import {
  validateLambdaSize,
  validateUncompressedLambdaSize,
  FunctionSizeError,
  MAX_LAMBDA_SIZE,
  MAX_LAMBDA_UNCOMPRESSED_SIZE,
  validateEnvWrapperSupport,
  ENV_WRAPPER_SUPPORTED_FAMILIES,
} from '../src/validate-lambda-size';

describe('validateLambdaSize()', () => {
  it('does not throw for lambdas under MAX_LAMBDA_SIZE', () => {
    expect(() => {
      validateLambdaSize('api/hello', 'nodejs20.x', 1024);
    }).not.toThrow();
  });

  it('throws FunctionSizeError for non-python lambdas exceeding MAX_LAMBDA_SIZE', () => {
    expect(() => {
      validateLambdaSize('api/hello', 'nodejs20.x', MAX_LAMBDA_SIZE + 1);
    }).toThrow(FunctionSizeError);
  });

  it('does not throw for python lambdas exceeding MAX_LAMBDA_SIZE', () => {
    expect(() => {
      validateLambdaSize('api/hello', 'python3.11', MAX_LAMBDA_SIZE + 1);
    }).not.toThrow();
  });

  it('FunctionSizeError has correct properties', () => {
    try {
      validateLambdaSize('api/hello', 'nodejs20.x', MAX_LAMBDA_SIZE + 1);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FunctionSizeError);
      const error = err as FunctionSizeError;
      expect(error.size).toEqual(MAX_LAMBDA_SIZE + 1);
      expect(error.maxSize).toEqual(MAX_LAMBDA_SIZE);
      expect(error.code).toEqual('NOW_SANDBOX_WORKER_MAX_LAMBDA_SIZE');
      expect(error.link).toEqual(
        'https://vercel.link/serverless-function-size'
      );
    }
  });

  it('does not throw at exactly MAX_LAMBDA_SIZE', () => {
    expect(() => {
      validateLambdaSize('api/hello', 'nodejs20.x', MAX_LAMBDA_SIZE);
    }).not.toThrow();
  });
});

describe('validateUncompressedLambdaSize()', () => {
  it('does not throw for sizes under the limit', () => {
    expect(() => {
      validateUncompressedLambdaSize('api/hello', 100 * 1024 * 1024);
    }).not.toThrow();
  });

  it('throws for sizes at or above the limit', () => {
    expect(() => {
      validateUncompressedLambdaSize('api/hello', MAX_LAMBDA_UNCOMPRESSED_SIZE);
    }).toThrow('uncompressed');
  });
});

describe('validateEnvWrapperSupport()', () => {
  it('does nothing when encrypted env params are undefined', () => {
    expect(() => {
      validateEnvWrapperSupport(undefined, undefined, {
        runtime: 'custom-runtime',
      });
    }).not.toThrow();
  });

  it('does not throw for supported runtime families', () => {
    for (const family of ENV_WRAPPER_SUPPORTED_FAMILIES) {
      expect(() => {
        validateEnvWrapperSupport('file.enc', 'content', {
          runtime: `${family}20.x`,
          createZip: async () => Buffer.from(''),
        });
      }).not.toThrow();
    }
  });

  it('does not throw when lambda has supportsWrapper=true', () => {
    expect(() => {
      validateEnvWrapperSupport('file.enc', 'content', {
        runtime: 'unknown-runtime',
        supportsWrapper: true,
        createZip: async () => Buffer.from(''),
      });
    }).not.toThrow();
  });

  it('throws for unsupported runtime without supportsWrapper', () => {
    expect(() => {
      validateEnvWrapperSupport('file.enc', 'content', {
        runtime: 'unknown-runtime',
        createZip: async () => Buffer.from(''),
      });
    }).toThrow('does not support more than 4KB');
  });

  it('throws when createZip is missing', () => {
    expect(() => {
      validateEnvWrapperSupport('file.enc', 'content', {
        runtime: 'nodejs20.x',
      });
    }).toThrow('has no createZip function');
  });
});

describe('constants', () => {
  it('MAX_LAMBDA_SIZE is 300 MB', () => {
    expect(MAX_LAMBDA_SIZE).toEqual(300 * 1024 * 1024);
  });

  it('MAX_LAMBDA_UNCOMPRESSED_SIZE is 250 MB', () => {
    expect(MAX_LAMBDA_UNCOMPRESSED_SIZE).toEqual(250 * 1024 * 1024);
  });
});

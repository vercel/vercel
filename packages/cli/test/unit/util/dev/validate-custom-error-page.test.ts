import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../../../src/util/validate-config';

describe('validateConfig with customErrorPage', () => {
  it('should not error with string customErrorPage', () => {
    const config = {
      customErrorPage: '_errors/error.html',
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should not error with object customErrorPage', () => {
    const config = {
      customErrorPage: {
        default5xx: '_errors/general-error.html',
        default4xx: '_errors/not-found.html',
      },
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should not error with partial object customErrorPage', () => {
    const config = {
      customErrorPage: {
        default5xx: '_errors/general-error.html',
      },
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should error with invalid type for customErrorPage', () => {
    const config = {
      customErrorPage: 123,
    } as any;
    const error = validateConfig(config);
    expect(error).not.toBeNull();
  });

  it('should error with invalid properties in object customErrorPage', () => {
    const config = {
      customErrorPage: {
        foo: 'bar',
      },
    } as any;
    const error = validateConfig(config);
    expect(error).not.toBeNull();
    // This usually matches the object schema and complains about additional properties
    expect(error?.message).toBeTruthy();
  });

  it('should error with empty object customErrorPage', () => {
    const config = {
      customErrorPage: {},
    };
    const error = validateConfig(config);
    expect(error).not.toBeNull();
  });
});

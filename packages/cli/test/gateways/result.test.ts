import { describe, expect, it } from 'vitest';
import {
  gatewayErrorCause,
  gatewayErrorFromCause,
} from '../../src/gateways/result';

describe('gatewayErrorFromCause', () => {
  it('uses the message of an Error cause and keeps the cause', () => {
    const cause = new Error('boom');

    expect(gatewayErrorFromCause('api_error', cause, { file: 'a' })).toEqual({
      code: 'api_error',
      message: 'boom',
      details: { file: 'a', cause },
    });
  });

  it('stringifies a non-Error cause', () => {
    expect(gatewayErrorFromCause('unknown', 42)).toEqual({
      code: 'unknown',
      message: '42',
      details: { cause: 42 },
    });
  });
});

describe('gatewayErrorCause', () => {
  it('returns the original cause', () => {
    const cause = new Error('boom');

    expect(
      gatewayErrorCause({ code: 'x', message: 'boom', details: { cause } })
    ).toBe(cause);
  });

  it('builds a coded Error when there is no cause', () => {
    const error = gatewayErrorCause({ code: 'no_token', message: 'No token' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: 'No token', code: 'no_token' });
  });
});

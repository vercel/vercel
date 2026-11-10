import { describe, expect, it } from 'vitest';
import {
  formatNetworkError,
  isRetryableNetworkError,
} from '../src/utils/network-error';

const coded = (code: string) =>
  Object.assign(new Error('private message'), { code });
const wrapped = (cause: unknown) =>
  Object.assign(new TypeError('fetch failed'), { cause });

describe('network failures', () => {
  it.each([
    'ECONNRESET',
    'EAI_AGAIN',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ])('retries nested %s failures', code =>
    expect(isRetryableNetworkError(wrapped(coded(code)))).toBe(true));
  it('checks every error in an aggregate connection failure', () => {
    expect(
      isRetryableNetworkError(
        wrapped(new AggregateError([coded('ETIMEDOUT'), coded('ENETUNREACH')]))
      )
    ).toBe(true);
    expect(
      isRetryableNetworkError(
        wrapped(
          new AggregateError([coded('ECONNRESET'), coded('CERT_HAS_EXPIRED')])
        )
      )
    ).toBe(false);
    expect(isRetryableNetworkError(new AggregateError([]))).toBe(false);
  });
  it('does not retry aborts, TLS failures, or programming errors', () => {
    expect(
      isRetryableNetworkError(
        Object.assign(coded('ECONNRESET'), { name: 'AbortError' })
      )
    ).toBe(false);
    expect(isRetryableNetworkError(wrapped(coded('CERT_HAS_EXPIRED')))).toBe(
      false
    );
    expect(isRetryableNetworkError(new TypeError('fetch failed'))).toBe(false);
  });
  it('bounds cycles and excludes messages, stacks and arbitrary properties', () => {
    const error = Object.assign(coded('ECONNRESET'), {
      syscall: 'connect',
      address: '127.0.0.1',
      port: 443,
      secret: 'TOKEN',
    });
    error.message = 'https://user:password@example.com/?token=TOKEN';
    const result = formatNetworkError(wrapped(new AggregateError([error])));
    expect(result).toContain('ECONNRESET');
    expect(result).not.toMatch(/password|TOKEN|private message|https/);
    const cycle = wrapped(undefined);
    cycle.cause = cycle;
    expect(isRetryableNetworkError(cycle)).toBe(false);
    expect(formatNetworkError(cycle)).toContain('[truncated]');
  });
});

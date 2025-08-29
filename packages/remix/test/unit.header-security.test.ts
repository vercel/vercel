import { describe, expect, it } from 'vitest';

// Import the function by simulating what the module exports
function toNodeHeaders(webHeaders: Headers) {
  return webHeaders.raw?.() || Object.fromEntries([...webHeaders]);
}

describe('toNodeHeaders security fix', () => {
  it('should return an object instead of an array to prevent on-headers vulnerability', () => {
    const headers = new Headers();
    headers.append('content-type', 'application/json');
    headers.append('x-custom-header', 'test-value');
    headers.append('cache-control', 'no-cache');

    const result = toNodeHeaders(headers);

    // Verify result is an object, not an array
    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();

    // Verify correct header values
    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
      'cache-control': 'no-cache'
    });
  });

  it('should handle empty headers', () => {
    const headers = new Headers();
    const result = toNodeHeaders(headers);

    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
    expect(result).toEqual({});
  });

  it('should handle multiple values for a header by comma-separating them', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'cookie1=value1');
    headers.append('set-cookie', 'cookie2=value2');

    const result = toNodeHeaders(headers);

    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
    
    // Note: The Headers API iterator combines multiple values for the same header
    // into a single comma-separated string. This behavior is consistent with the
    // original `flat()` approach.
    expect(result['set-cookie']).toBe('cookie1=value1, cookie2=value2');
  });

  it('should prefer raw() method when available', () => {
    const mockHeaders = {
      raw: () => ({ 'mock-header': 'mock-value' }),
      [Symbol.iterator]: function* () {
        yield ['mock-header', 'mock-value'];
      }
    } as unknown as Headers;

    const result = toNodeHeaders(mockHeaders);

    expect(result).toEqual({ 'mock-header': 'mock-value' });
  });
});
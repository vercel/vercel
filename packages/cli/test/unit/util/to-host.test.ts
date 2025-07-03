import { describe, expect, it } from 'vitest';
import toHost, { validateUrlProtocol } from '../../../src/util/to-host';

describe('toHost', () => {
  it('should parse simple to host', () => {
    expect(toHost('vercel.com')).toEqual('vercel.com');
  });

  it('should parse leading // to host', () => {
    expect(toHost('//zeit-logos-rnemgaicnc.now.sh')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse leading http:// to host', () => {
    expect(toHost('http://zeit-logos-rnemgaicnc.now.sh')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse leading https:// to host', () => {
    expect(toHost('https://zeit-logos-rnemgaicnc.now.sh')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse leading https:// and path to host', () => {
    expect(toHost('https://zeit-logos-rnemgaicnc.now.sh/path')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse simple and path to host', () => {
    expect(toHost('vercel.com/test')).toEqual('vercel.com');
  });

  it('should extract hostname from valid URLs', () => {
    expect(toHost('https://example.com')).toBe('example.com');
    expect(toHost('http://example.com')).toBe('example.com');
    expect(toHost('example.com')).toBe('example.com');
    expect(toHost('https://sub.example.com/path')).toBe('sub.example.com');
  });

  it('should auto-correct protocol typos', () => {
    // Missing slash in protocol
    expect(toHost('https:/example.com')).toBe('example.com');
    expect(toHost('http:/example.com')).toBe('example.com');
    
    // Extra slash in protocol
    expect(toHost('https:///example.com')).toBe('example.com');
    expect(toHost('http:///example.com')).toBe('example.com');
  });
});

describe('validateUrlProtocol', () => {
  it('should return valid for correct protocols', () => {
    expect(validateUrlProtocol('https://example.com')).toEqual({ isValid: true });
    expect(validateUrlProtocol('http://example.com')).toEqual({ isValid: true });
    expect(validateUrlProtocol('example.com')).toEqual({ isValid: true });
  });

  it('should detect missing slash in protocol', () => {
    const result = validateUrlProtocol('https:/example.com');
    expect(result.isValid).toBe(false);
    expect(result.correctedUrl).toBe('https://example.com');
    expect(result.error).toContain('Invalid protocol format');
    expect(result.suggestion).toContain('Did you mean "https://example.com"');
    expect(result.suggestion).toContain('Missing slash after protocol');
  });

  it('should detect extra slash in protocol', () => {
    const result = validateUrlProtocol('https:///example.com');
    expect(result.isValid).toBe(false);
    expect(result.correctedUrl).toBe('https://example.com');
    expect(result.error).toContain('Invalid protocol format');
    expect(result.suggestion).toContain('Did you mean "https://example.com"');
    expect(result.suggestion).toContain('Extra slash in protocol');
  });

  it('should detect missing slashes after protocol', () => {
    const result = validateUrlProtocol('https:example.com');
    expect(result.isValid).toBe(false);
    expect(result.correctedUrl).toBe('https://example.com');
    expect(result.error).toContain('Invalid protocol format');
    expect(result.suggestion).toContain('Did you mean "https://example.com"');
    expect(result.suggestion).toContain('Missing slashes after protocol');
  });

  it('should handle the specific case from the bug report', () => {
    const result = validateUrlProtocol('https:/dev.dlp.cyera.io');
    expect(result.isValid).toBe(false);
    expect(result.correctedUrl).toBe('https://dev.dlp.cyera.io');
    expect(result.error).toContain('Invalid protocol format in "https:/dev.dlp.cyera.io"');
    expect(result.suggestion).toContain('Did you mean "https://dev.dlp.cyera.io"?');
    expect(result.suggestion).toContain('Missing slash after protocol');
  });
});

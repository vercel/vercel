import { describe, test, expect } from 'vitest';
import {
  isValidCookieName,
  isValidCookieValue,
  isValidCookiePath,
  isValidCookieDomain,
  sanitizeCookieName,
} from '../src/cookie-validation';

describe('Cookie Validation', () => {
  describe('isValidCookieName', () => {
    test('should accept valid cookie names', () => {
      expect(isValidCookieName('sessionid')).toBe(true);
      expect(isValidCookieName('user_token')).toBe(true);
      expect(isValidCookieName('auth-token')).toBe(true);
      expect(isValidCookieName('JSESSIONID')).toBe(true);
      expect(isValidCookieName('simple123')).toBe(true);
    });

    test('should reject cookie names with control characters', () => {
      expect(isValidCookieName('session\x00id')).toBe(false); // null
      expect(isValidCookieName('session\x08id')).toBe(false); // backspace
      expect(isValidCookieName('session\x09id')).toBe(false); // tab
      expect(isValidCookieName('session\x0Aid')).toBe(false); // newline
      expect(isValidCookieName('session\x0Did')).toBe(false); // carriage return
      expect(isValidCookieName('session\x7Fid')).toBe(false); // delete
    });

    test('should reject cookie names with separator characters', () => {
      expect(isValidCookieName('session;id')).toBe(false);
      expect(isValidCookieName('session,id')).toBe(false);
      expect(isValidCookieName('session=id')).toBe(false);
      expect(isValidCookieName('session id')).toBe(false); // space
      expect(isValidCookieName('session\tid')).toBe(false); // tab
      expect(isValidCookieName('session"id')).toBe(false);
      expect(isValidCookieName('session(id)')).toBe(false);
      expect(isValidCookieName('session[id]')).toBe(false);
      expect(isValidCookieName('session{id}')).toBe(false);
      expect(isValidCookieName('session<id>')).toBe(false);
      expect(isValidCookieName('session@id')).toBe(false);
      expect(isValidCookieName('session:id')).toBe(false);
      expect(isValidCookieName('session\\id')).toBe(false);
      expect(isValidCookieName('session/id')).toBe(false);
      expect(isValidCookieName('session?id')).toBe(false);
    });

    test('should reject empty or invalid names', () => {
      expect(isValidCookieName('')).toBe(false);
      expect(isValidCookieName(null as any)).toBe(false);
      expect(isValidCookieName(undefined as any)).toBe(false);
      expect(isValidCookieName(123 as any)).toBe(false);
    });
  });

  describe('isValidCookieValue', () => {
    test('should accept valid cookie values', () => {
      expect(isValidCookieValue('abc123')).toBe(true);
      expect(isValidCookieValue('user@example.com')).toBe(true);
      expect(isValidCookieValue('token-123-456')).toBe(true);
      expect(isValidCookieValue('')).toBe(true); // empty is valid
      expect(isValidCookieValue('hello_world')).toBe(true);
    });

    test('should reject cookie values with control characters', () => {
      expect(isValidCookieValue('value\x00test')).toBe(false); // null
      expect(isValidCookieValue('value\x08test')).toBe(false); // backspace
      expect(isValidCookieValue('value\x09test')).toBe(false); // tab
      expect(isValidCookieValue('value\x0Atest')).toBe(false); // newline
      expect(isValidCookieValue('value\x0Dtest')).toBe(false); // carriage return
      expect(isValidCookieValue('value\x7Ftest')).toBe(false); // delete
    });

    test('should reject cookie values with forbidden characters', () => {
      expect(isValidCookieValue('value"test')).toBe(false); // double quote
      expect(isValidCookieValue('value,test')).toBe(false); // comma
      expect(isValidCookieValue('value;test')).toBe(false); // semicolon
      expect(isValidCookieValue('value\\test')).toBe(false); // backslash
    });

    test('should reject cookie values with whitespace characters', () => {
      expect(isValidCookieValue('value test')).toBe(false); // space
      expect(isValidCookieValue('value\ttest')).toBe(false); // tab (also covered in control chars)
    });

    test('should handle non-string values', () => {
      expect(isValidCookieValue(123 as any)).toBe(false);
      expect(isValidCookieValue(null as any)).toBe(false);
      expect(isValidCookieValue(undefined as any)).toBe(false);
    });
  });

  describe('isValidCookiePath', () => {
    test('should accept valid cookie paths', () => {
      expect(isValidCookiePath('/')).toBe(true);
      expect(isValidCookiePath('/app')).toBe(true);
      expect(isValidCookiePath('/app/dashboard')).toBe(true);
      expect(isValidCookiePath('/api/v1/users')).toBe(true);
      expect(isValidCookiePath('')).toBe(true); // empty is valid (defaults to request path)
    });

    test('should reject paths that do not start with /', () => {
      expect(isValidCookiePath('app')).toBe(false);
      expect(isValidCookiePath('app/dashboard')).toBe(false);
    });

    test('should reject paths with control characters', () => {
      expect(isValidCookiePath('/app\x00test')).toBe(false); // null
      expect(isValidCookiePath('/app\x08test')).toBe(false); // backspace
      expect(isValidCookiePath('/app\x0Atest')).toBe(false); // newline
    });

    test('should reject paths with semicolons', () => {
      expect(isValidCookiePath('/app;test')).toBe(false);
    });

    test('should handle non-string paths', () => {
      expect(isValidCookiePath(123 as any)).toBe(false);
      expect(isValidCookiePath(null as any)).toBe(false);
      expect(isValidCookiePath(undefined as any)).toBe(false);
    });
  });

  describe('isValidCookieDomain', () => {
    test('should accept valid cookie domains', () => {
      expect(isValidCookieDomain('example.com')).toBe(true);
      expect(isValidCookieDomain('.example.com')).toBe(true); // leading dot for subdomains
      expect(isValidCookieDomain('subdomain.example.com')).toBe(true);
      expect(isValidCookieDomain('test-site.example.org')).toBe(true);
      expect(isValidCookieDomain('')).toBe(true); // empty is valid (uses request host)
      expect(isValidCookieDomain('localhost')).toBe(true); // special case
    });

    test('should reject domains with invalid characters', () => {
      expect(isValidCookieDomain('example.com/path')).toBe(false);
      expect(isValidCookieDomain('example .com')).toBe(false);
      expect(isValidCookieDomain('example@.com')).toBe(false);
      expect(isValidCookieDomain('example_.com')).toBe(false);
    });

    test('should reject domains starting or ending with hyphens', () => {
      expect(isValidCookieDomain('-example.com')).toBe(false);
      expect(isValidCookieDomain('example-.com')).toBe(false);
      expect(isValidCookieDomain('example.com-')).toBe(false);
    });

    test('should reject domains with consecutive dots', () => {
      expect(isValidCookieDomain('example..com')).toBe(false);
      expect(isValidCookieDomain('..example.com')).toBe(false);
    });

    test('should reject single-level domains (except localhost)', () => {
      expect(isValidCookieDomain('example')).toBe(false);
      expect(isValidCookieDomain('test')).toBe(false);
      expect(isValidCookieDomain('localhost')).toBe(true); // exception
    });

    test('should handle non-string domains', () => {
      expect(isValidCookieDomain(123 as any)).toBe(false);
      expect(isValidCookieDomain(null as any)).toBe(false);
      expect(isValidCookieDomain(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeCookieName', () => {
    test('should preserve valid characters', () => {
      expect(sanitizeCookieName('valid_name')).toBe('valid_name');
      expect(sanitizeCookieName('auth-token')).toBe('auth-token');
      expect(sanitizeCookieName('sessionId123')).toBe('sessionId123');
    });

    test('should remove invalid characters', () => {
      expect(sanitizeCookieName('session;id')).toBe('sessionid');
      expect(sanitizeCookieName('session id')).toBe('sessionid');
      expect(sanitizeCookieName('session=id')).toBe('sessionid');
      expect(sanitizeCookieName('session,id')).toBe('sessionid');
      expect(sanitizeCookieName('session"id')).toBe('sessionid');
    });

    test('should handle control characters', () => {
      expect(sanitizeCookieName('session\x00id')).toBe('sessionid');
      expect(sanitizeCookieName('session\x09id')).toBe('sessionid');
      expect(sanitizeCookieName('session\x0Aid')).toBe('sessionid');
    });

    test('should handle non-string input', () => {
      expect(sanitizeCookieName(123 as any)).toBe('');
      expect(sanitizeCookieName(null as any)).toBe('');
      expect(sanitizeCookieName(undefined as any)).toBe('');
    });

    test('should handle empty string', () => {
      expect(sanitizeCookieName('')).toBe('');
    });
  });

  describe('real-world attack scenarios', () => {
    test('should prevent HTTP response splitting attacks', () => {
      expect(isValidCookieName('session\r\nSet-Cookie: malicious=true')).toBe(false);
      expect(isValidCookieValue('value\r\nSet-Cookie: malicious=true')).toBe(false);
      expect(isValidCookiePath('/path\r\nSet-Cookie: malicious=true')).toBe(false);
    });

    test('should prevent cookie injection attacks', () => {
      expect(isValidCookieName('session; malicious=evil')).toBe(false);
      expect(isValidCookieValue('value; malicious=evil')).toBe(false);
      expect(isValidCookiePath('/path; malicious=evil')).toBe(false);
    });

    test('should prevent domain spoofing', () => {
      expect(isValidCookieDomain('evil.com')).toBe(true); // This is actually valid
      expect(isValidCookieDomain('evil .com')).toBe(false); // But spaces are not
      expect(isValidCookieDomain('.evil..com')).toBe(false); // Consecutive dots
    });
  });
});
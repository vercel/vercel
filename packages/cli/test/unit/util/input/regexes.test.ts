import { describe, expect, it } from 'vitest';
import { email } from '../../../../src/util/input/regexes';

describe('regexes', () => {
  describe('email regex', () => {
    it('should match valid email addresses', () => {
      expect(email.test('user@example.com')).toBe(true);
      expect(email.test('test.email@domain.org')).toBe(true);
      expect(email.test('user123@test-domain.net')).toBe(true);
      expect(email.test('john.doe+tag@company.co.uk')).toBe(true);
      expect(email.test('a@b.c')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(email.test('invalid')).toBe(false);
      expect(email.test('user@')).toBe(false);
      expect(email.test('@domain.com')).toBe(false);
      expect(email.test('user@domain')).toBe(false);
      expect(email.test('user@domain.')).toBe(false);
      expect(email.test('user@.com')).toBe(false);
    });

    it('should handle spaces and special characters like the original', () => {
      // These cases match the original regex behavior for compatibility
      expect(email.test('user name@domain.com')).toBe(true);
      expect(email.test('user@domain name.com')).toBe(true);
      expect(email.test('user@domain..com')).toBe(true);
    });

    it('should not have ReDoS vulnerability', () => {
      // Test with inputs that could cause catastrophic backtracking in vulnerable regex
      const potentiallyProblematicInputs = [
        'user@' + 'a'.repeat(50) + '.com',
        'test@' + 'domain.'.repeat(20) + 'com',
        'a@' + 'x'.repeat(100) + '.y'
      ];
      
      potentiallyProblematicInputs.forEach(testCase => {
        const start = Date.now();
        const result = email.test(testCase);
        const duration = Date.now() - start;
        
        // Should complete very quickly (under 10ms)
        expect(duration).toBeLessThan(10);
        // Most of these should be valid emails
        if (testCase.includes('domain.domain.')) {
          expect(result).toBe(true); // Multiple subdomains are valid
        }
      });
    });

    it('should work with the validateEmail pattern from teams/invite.ts', () => {
      // Replicate the validation logic from the actual usage
      const validateEmail = (data: string) => email.test(data.trim()) || data.length === 0;
      
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('  user@example.com  ')).toBe(true); // Trimmed
      expect(validateEmail('')).toBe(true); // Empty is valid
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('user@domain')).toBe(false);
    });
  });
});
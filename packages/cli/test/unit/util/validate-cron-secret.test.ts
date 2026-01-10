import { validateCronSecret } from '../../../src/util/validate-cron-secret';

describe('validateCronSecret', () => {
  describe('valid CRON_SECRET values', () => {
    it('should return null for undefined CRON_SECRET', () => {
      const error = validateCronSecret(undefined);
      expect(error).toBeNull();
    });

    it('should return null for empty string CRON_SECRET', () => {
      const error = validateCronSecret('');
      expect(error).toBeNull();
    });

    it('should return null for valid alphanumeric secret', () => {
      const error = validateCronSecret('mySecretToken123');
      expect(error).toBeNull();
    });

    it('should return null for valid secret with special characters', () => {
      const error = validateCronSecret('Bearer my-secret_token.123!@#$%^&*()');
      expect(error).toBeNull();
    });

    it('should return null for valid secret with spaces in the middle', () => {
      const error = validateCronSecret('Bearer token123');
      expect(error).toBeNull();
    });

    it('should return null for valid secret with tab in the middle', () => {
      const error = validateCronSecret('Bearer\ttoken123');
      expect(error).toBeNull();
    });

    it('should return null for a 16-character random string', () => {
      const error = validateCronSecret('aB3dEf6hIj9kLmN0');
      expect(error).toBeNull();
    });

    it('should return null for all printable ASCII characters', () => {
      // All visible ASCII characters (0x21-0x7E)
      const visibleAscii = Array.from({ length: 94 }, (_, i) =>
        String.fromCharCode(0x21 + i)
      ).join('');
      const error = validateCronSecret(visibleAscii);
      expect(error).toBeNull();
    });
  });

  describe('invalid CRON_SECRET values - whitespace issues', () => {
    it('should return error for secret with leading space', () => {
      const error = validateCronSecret(' mySecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('leading or trailing whitespace');
    });

    it('should return error for secret with trailing space', () => {
      const error = validateCronSecret('mySecret ');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('leading or trailing whitespace');
    });

    it('should return error for secret with leading tab', () => {
      const error = validateCronSecret('\tmySecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('leading or trailing whitespace');
    });

    it('should return error for secret with trailing tab', () => {
      const error = validateCronSecret('mySecret\t');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('leading or trailing whitespace');
    });

    it('should return error for secret with leading newline', () => {
      const error = validateCronSecret('\nmySecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
    });

    it('should return error for secret with trailing newline', () => {
      const error = validateCronSecret('mySecret\n');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
    });
  });

  describe('invalid CRON_SECRET values - control characters', () => {
    it('should return error for secret with null character', () => {
      const error = validateCronSecret('my\x00Secret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('control character');
      expect(error!.message).toContain('0x00');
    });

    it('should return error for secret with bell character', () => {
      const error = validateCronSecret('my\x07Secret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('control character');
    });

    it('should return error for secret with carriage return', () => {
      const error = validateCronSecret('my\rSecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('control character');
    });

    it('should return error for secret with newline in the middle', () => {
      const error = validateCronSecret('my\nSecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('control character');
    });

    it('should return error for secret with DEL character', () => {
      const error = validateCronSecret('my\x7FSecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('DEL character');
    });

    it('should return error for secret with escape character', () => {
      const error = validateCronSecret('my\x1BSecret');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('control character');
    });
  });

  describe('invalid CRON_SECRET values - non-ASCII characters', () => {
    it('should return error for secret with non-ASCII character (é)', () => {
      const error = validateCronSecret('mySecrét');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('non-ASCII character');
    });

    it('should return error for secret with emoji', () => {
      const error = validateCronSecret('mySecret🔐');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('non-ASCII character');
    });

    it('should return error for secret with Chinese character', () => {
      const error = validateCronSecret('mySecret密钥');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('non-ASCII character');
    });

    it('should return error for secret with high ASCII character', () => {
      const error = validateCronSecret('mySecret\x80');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('non-ASCII character');
    });

    it('should return error for secret with Latin-1 supplement character (©)', () => {
      const error = validateCronSecret('mySecret©');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('INVALID_CRON_SECRET');
      expect(error!.message).toContain('non-ASCII character');
    });
  });

  describe('error message formatting', () => {
    it('should list multiple invalid characters', () => {
      const error = validateCronSecret('a\x00b\x01c\x02d');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('position 1');
      expect(error!.message).toContain('position 3');
      expect(error!.message).toContain('position 5');
    });

    it('should truncate when more than 3 invalid characters', () => {
      const error = validateCronSecret('a\x00b\x01c\x02d\x03e\x04f');
      expect(error).not.toBeNull();
      expect(error!.message).toContain('and 2 more');
    });

    it('should include the documentation link', () => {
      const error = validateCronSecret('my\x00Secret');
      expect(error).not.toBeNull();
      expect(error!.link).toBe(
        'https://vercel.link/securing-cron-jobs'
      );
    });

    it('should include the Learn More action', () => {
      const error = validateCronSecret('my\x00Secret');
      expect(error).not.toBeNull();
      expect(error!.action).toBe('Learn More');
    });
  });
});

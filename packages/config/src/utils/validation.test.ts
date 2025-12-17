import { describe, it, expect } from 'vitest';
import {
  validateRegexPattern,
  parseCronExpression,
  createCronExpression,
  countCaptureGroups,
  validateCaptureGroupReferences,
  type CronPart,
} from './validation';

describe('Regex Validation', () => {
  it('should accept valid regex patterns', () => {
    const validPatterns = [
      '/api/(.*)',
      '/blog/:slug',
      '/feedback/((?!general).*)',
      '[0-9]+',
      '(foo|bar)',
      '^/static/.*$',
    ];

    validPatterns.forEach(pattern => {
      expect(() => validateRegexPattern(pattern)).not.toThrow();
    });
  });

  it('should reject invalid regex patterns', () => {
    const invalidPatterns = [
      '[unclosed',
      '(unmatched',
      '**?+',
      '/feedback/(?!general)', // Negative lookahead without group
      '/*', // Invalid wildcard pattern
      '/**', // Invalid double wildcard pattern
    ];

    invalidPatterns.forEach(pattern => {
      expect(() => validateRegexPattern(pattern)).toThrow();
    });
  });

  it('should provide helpful error message for negative lookaheads', () => {
    const pattern = '/feedback/(?!general)';
    expect(() => validateRegexPattern(pattern)).toThrow(
      'Invalid path-to-regexp pattern: Negative lookaheads must be wrapped in a group'
    );
  });

  it('should provide helpful error message for wildcard patterns', () => {
    const pattern = '/*';
    expect(() => validateRegexPattern(pattern)).toThrow(
      "Invalid path-to-regexp pattern: Use '(.*)' instead of '*' for wildcards"
    );
  });
});

describe('Cron Expression Validation', () => {
  it('should parse valid cron expressions', () => {
    const validExpressions = [
      '* * * * *',
      '0 0 * * *',
      '*/15 */6 * * *',
      '0 12 * * 1-5',
    ];

    validExpressions.forEach(expr => {
      expect(() => parseCronExpression(expr)).not.toThrow();
    });
  });

  it('should reject invalid cron expressions', () => {
    const invalidExpressions = [
      '* * *', // too few parts
      '* * * * * *', // too many parts
      '60 * * * *', // invalid minute
      '* 24 * * *', // invalid hour
      '* * 32 * *', // invalid day
      '* * * 13 *', // invalid month
      '* * * * 7', // invalid day of week
    ];

    invalidExpressions.forEach(expr => {
      expect(() => parseCronExpression(expr)).toThrow();
    });
  });

  it('should create valid cron expressions', () => {
    const cronPart: CronPart = {
      minute: '*/15',
      hour: '*/2',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '1-5',
    };

    const expression = createCronExpression(cronPart);
    expect(expression).toBe('*/15 */2 * * 1-5');
    expect(() => parseCronExpression(expression)).not.toThrow();
  });
});

describe('Capture Group Validation', () => {
  describe('countCaptureGroups', () => {
    it('should count capture groups in regex patterns', () => {
      expect(countCaptureGroups('/api/(.*)')).toBe(1);
      expect(countCaptureGroups('/api/(.*)/(.*)')).toBe(2);
      expect(countCaptureGroups('/api/([^/]+)/([0-9]+)')).toBe(2);
      expect(countCaptureGroups('/api/(foo|bar)/(baz|qux)/(.*)')).toBe(3);
    });

    it('should count named parameters', () => {
      expect(countCaptureGroups('/users/:userId')).toBe(1);
      expect(countCaptureGroups('/users/:userId/posts/:postId')).toBe(2);
      expect(countCaptureGroups('/blog/:year/:month/:slug')).toBe(3);
    });

    it('should count mixed patterns', () => {
      expect(countCaptureGroups('/api/:version/(.*)')).toBe(2);
      expect(countCaptureGroups('/users/:userId/files/(.*)')).toBe(2);
    });

    it('should handle patterns with no capture groups', () => {
      expect(countCaptureGroups('/api/static')).toBe(0);
      expect(countCaptureGroups('/about')).toBe(0);
    });
  });

  describe('validateCaptureGroupReferences', () => {
    it('should accept valid capture group references', () => {
      expect(() =>
        validateCaptureGroupReferences('/api/(.*)', 'https://backend.com/$1')
      ).not.toThrow();

      expect(() =>
        validateCaptureGroupReferences(
          '/api/(.*)/(.*)/(.*)',
          'https://api.com/$1/$2/$3'
        )
      ).not.toThrow();

      expect(() =>
        validateCaptureGroupReferences('/users/:userId', '/api/users/$1')
      ).not.toThrow();

      expect(() =>
        validateCaptureGroupReferences(
          '/users/:userId/posts/:postId',
          '/api/$1/posts/$2'
        )
      ).not.toThrow();
    });

    it('should accept destinations without capture group references', () => {
      expect(() =>
        validateCaptureGroupReferences('/api/(.*)', 'https://backend.com/')
      ).not.toThrow();

      expect(() =>
        validateCaptureGroupReferences(
          '/api/(.*)',
          'https://backend.com/static/page'
        )
      ).not.toThrow();
    });

    it('should reject invalid capture group references', () => {
      expect(() =>
        validateCaptureGroupReferences('/api/(.*)', 'https://backend.com/$2')
      ).toThrow('Invalid capture group reference: $2 used in destination');

      expect(() =>
        validateCaptureGroupReferences(
          '/api/(.*)/(.*)/(.*)',
          'https://api.com/$4'
        )
      ).toThrow('only has 3 capture group(s)');

      expect(() =>
        validateCaptureGroupReferences('/api/static', 'https://backend.com/$1')
      ).toThrow('only has 0 capture group(s)');
    });

    it('should provide helpful error messages', () => {
      expect(() =>
        validateCaptureGroupReferences('/api/(.*)', 'https://backend.com/$2')
      ).toThrow('Valid references are: $1');

      expect(() =>
        validateCaptureGroupReferences(
          '/api/(.*)/(.*)/(.*)',
          'https://backend.com/$5'
        )
      ).toThrow('Valid references are: $1, $2, $3');

      expect(() =>
        validateCaptureGroupReferences('/static', 'https://backend.com/$1')
      ).toThrow('Valid references are: none');
    });

    it('should handle environment variables without false positives', () => {
      expect(() =>
        validateCaptureGroupReferences(
          '/api/(.*)',
          'https://$API_TOKEN.backend.com/$1'
        )
      ).not.toThrow();

      expect(() =>
        validateCaptureGroupReferences(
          '/api/static',
          'https://$API_TOKEN.backend.com/'
        )
      ).not.toThrow();
    });
  });
});

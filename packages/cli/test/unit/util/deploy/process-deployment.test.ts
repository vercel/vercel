import { describe, it, expect } from 'vitest';
import {
  handleErrorSolvableWithArchive,
  formatUploadFailureError,
  archiveSuggestionText,
  UploadErrorMissingArchive,
  UploadFailureError,
} from '../../../../src/util/deploy/process-deployment';

describe('processDeployment()', () => {
  describe('handleErrorSolvableWithArchive()', () => {
    it('should return a too many files error', () => {
      const originalMessage = `Invalid request: 'files' should NOT have more than 15000 items, received 15001.`;
      const result = handleErrorSolvableWithArchive({
        code: 'too_many_files',
        message: originalMessage,
      });
      expect(result).toBeInstanceOf(UploadErrorMissingArchive);
      expect(result?.message).toEqual(
        `${originalMessage}\n${archiveSuggestionText}`
      );
    });

    it('should return an upload rate limit error', () => {
      const originalMessage =
        'Too many requests - try again in 22 hours (more than 5000, code: "api-upload-paid").';

      const result = handleErrorSolvableWithArchive({
        code: 'rate_limited',
        message: originalMessage,
        errorName: 'api-upload-paid',
      });
      expect(result).toBeInstanceOf(UploadErrorMissingArchive);
      expect(result?.message).toEqual(
        `${originalMessage}\n${archiveSuggestionText}`
      );
    });

    it('should return an entity too large error', () => {
      const originalMessage = 'Request Entity Too Large';
      const result = handleErrorSolvableWithArchive({
        message: originalMessage,
      });
      expect(result).toBeInstanceOf(UploadErrorMissingArchive);
      expect(result?.message).toEqual(
        `${originalMessage}\n${archiveSuggestionText}`
      );
    });

    it('should not throw if missing `rateLimitName`', () => {
      expect(
        handleErrorSolvableWithArchive({
          code: 'rate_limited',
          message: 'string containing api-upload',
        })
      ).not.toBeInstanceOf(UploadErrorMissingArchive);
    });

    it('should not throw for other rate limits', () => {
      expect(
        handleErrorSolvableWithArchive({
          code: 'rate_limited',
          message: 'string containing api-upload',
          rateLimitName: 'api-size-limit',
        })
      ).not.toBeInstanceOf(UploadErrorMissingArchive);
    });

    it('should not throw if rate_limited message missing `api-upload`', () => {
      expect(
        handleErrorSolvableWithArchive({
          code: 'rate_limited',
          message: 'other message',
        })
      ).not.toBeInstanceOf(UploadErrorMissingArchive);
    });

    it('should not throw if no message', () => {
      expect(
        handleErrorSolvableWithArchive({
          code: 'too_many_files',
        })
      ).not.toBeInstanceOf(UploadErrorMissingArchive);
    });
  });

  describe('formatUploadFailureError()', () => {
    it('should return a network timeout error', () => {
      const result = formatUploadFailureError(
        new Error('connect ETIMEDOUT 52.0.0.0:443')
      );

      expect(result).toBeInstanceOf(UploadFailureError);
      expect(result?.message).toContain(
        'Failed to upload deployment files to Vercel.'
      );
      expect(result?.message).toContain('timed out or was interrupted');
      expect(result?.message).toContain(archiveSuggestionText);
    });

    it('should return a fetch failed error from nested cause', () => {
      const result = formatUploadFailureError(
        new Error('fetch failed', {
          cause: new Error('connect ETIMEDOUT'),
        })
      );

      expect(result).toBeInstanceOf(UploadFailureError);
      expect(result?.message).toContain('timed out or was interrupted');
    });

    it('should return a gateway error for invalid JSON responses', () => {
      const result = formatUploadFailureError(
        new Error(
          `invalid json response body at https://api.vercel.com/v2/files reason: Unexpected token '<'`
        )
      );

      expect(result).toBeInstanceOf(UploadFailureError);
      expect(result?.message).toContain('unexpected response');
      expect(result?.link).toBe('https://www.vercel-status.com/');
    });

    it('should omit archive suggestion when archive is set', () => {
      const result = formatUploadFailureError(new Error('fetch failed'), {
        archive: 'tgz',
      });

      expect(result?.message).not.toContain(archiveSuggestionText);
    });

    it('should return undefined for unrelated errors', () => {
      expect(
        formatUploadFailureError(new Error('Project not found'))
      ).toBeUndefined();
    });
  });
});

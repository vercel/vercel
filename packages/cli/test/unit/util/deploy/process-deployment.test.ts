import { describe, it, expect } from 'vitest';
import {
  handleErrorSolvableWithArchive,
  archiveSuggestionText,
  UploadErrorMissingArchive,
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
});

import { describe, it, expect } from 'vitest';
import {
  handleErrorSolvableWithArchive,
  handleErrorSolvableWithFunctionsBeta,
  archiveSuggestionText,
  FunctionsSizeLimitError,
  UploadErrorMissingArchive,
} from '../../../../src/util/deploy/process-deployment';

describe('processDeployment()', () => {
  describe('handleErrorSolvableWithFunctionsBeta()', () => {
    it('should return FunctionsSizeLimitError for LAMBDA_SIZE_EXCEEDED error code', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'error',
        errorCode: 'LAMBDA_SIZE_EXCEEDED',
        errorMessage:
          'Function size of 600MB exceeds Lambda size limit of 500MB',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
      expect(result?.message).toBe(
        'Function size of 600MB exceeds Lambda size limit of 500MB'
      );
    });

    it('should return FunctionsSizeLimitError for "Lambda size limit" message', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'Build output exceeds Lambda size limit of 500MB',
        errorMessage: 'Build output exceeds Lambda size limit of 500MB',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
    });

    it('should return FunctionsSizeLimitError for "Lambda ephemeral storage" message', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'Deployment exceeds Lambda ephemeral storage limit',
        errorMessage: 'Deployment exceeds Lambda ephemeral storage limit',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
    });

    it('should return FunctionsSizeLimitError for "exceeds Lambda limit" message', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'Output exceeds Lambda limit',
        errorMessage: 'Output exceeds Lambda limit',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
    });

    it('should return undefined for unrelated error codes', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'Deployment not found',
        errorCode: 'DEPLOYMENT_NOT_FOUND',
      });
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-error-like input', () => {
      expect(handleErrorSolvableWithFunctionsBeta(null)).toBeUndefined();
      expect(handleErrorSolvableWithFunctionsBeta('string')).toBeUndefined();
      expect(handleErrorSolvableWithFunctionsBeta(42)).toBeUndefined();
    });

    it('should use fallback message when errorMessage is missing', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'Fallback message',
        errorCode: 'LAMBDA_SIZE_EXCEEDED',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
      expect(result?.message).toBe('Fallback message');
    });

    it('should use default message when errorMessage is missing and message is generic', () => {
      // isErrorLike requires `message` to be present, but LAMBDA_SIZE_EXCEEDED
      // should still produce a FunctionsSizeLimitError with the default message
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'generic',
        errorCode: 'LAMBDA_SIZE_EXCEEDED',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
      // Falls back to (error as any).message since errorMessage is missing
      expect(result?.message).toBe('generic');
    });

    it('should have a link property', () => {
      const result = handleErrorSolvableWithFunctionsBeta({
        message: 'test',
        errorCode: 'LAMBDA_SIZE_EXCEEDED',
        errorMessage: 'test',
      });
      expect(result).toBeInstanceOf(FunctionsSizeLimitError);
      expect(result?.link).toBe(
        'https://vercel.com/docs/errors/FUNCTIONS_BETA'
      );
    });
  });

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

import { describe, expect, it } from 'vitest';
import {
  AGENT_STATUS,
  AGENT_REASON,
  AGENT_ACTION,
} from '../../../src/util/agent-output-constants';

describe('agent-output-constants', () => {
  describe('AGENT_REASON', () => {
    it('includes input hardening reasons', () => {
      expect(AGENT_REASON.PATH_TRAVERSAL).toBe('path_traversal');
      expect(AGENT_REASON.CONTROL_CHARS).toBe('control_chars');
      expect(AGENT_REASON.INVALID_RESOURCE_ID).toBe('invalid_resource_id');
    });

    it('includes dry-run reason', () => {
      expect(AGENT_REASON.DRY_RUN_OK).toBe('dry_run_ok');
    });

    it('preserves existing reasons', () => {
      expect(AGENT_REASON.MISSING_ARGUMENTS).toBe('missing_arguments');
      expect(AGENT_REASON.API_ERROR).toBe('api_error');
      expect(AGENT_REASON.NOT_LINKED).toBe('not_linked');
    });

    it('has unique values', () => {
      const values = Object.values(AGENT_REASON);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe('AGENT_STATUS', () => {
    it('defines the expected statuses', () => {
      expect(AGENT_STATUS.ERROR).toBe('error');
      expect(AGENT_STATUS.ACTION_REQUIRED).toBe('action_required');
      expect(AGENT_STATUS.OK).toBe('ok');
    });
  });

  describe('AGENT_ACTION', () => {
    it('defines the expected actions', () => {
      expect(AGENT_ACTION.MISSING_ARGUMENTS).toBe('missing_arguments');
      expect(AGENT_ACTION.CONFIRMATION_REQUIRED).toBe('confirmation_required');
      expect(AGENT_ACTION.LOGIN_REQUIRED).toBe('login_required');
    });
  });
});

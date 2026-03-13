/**
 * Global constants for non-interactive agent payloads (status, reason, action).
 *
 * This is the single source of truth for all commands. When adding or changing
 * non-interactive JSON output (outputAgentError, outputActionRequired), import
 * from here so values stay consistent across dns, flags, routes, env, domains,
 * link, etc., and are easy to change in one place.
 *
 * Usage:
 *   import { AGENT_STATUS, AGENT_REASON, AGENT_ACTION } from '../../util/agent-output-constants';
 *   outputAgentError(client, { status: AGENT_STATUS.ERROR, reason: AGENT_REASON.NOT_LINKED, ... }, 1);
 */

/** status field for ActionRequiredPayload and AgentErrorPayload */
export const AGENT_STATUS = {
  ACTION_REQUIRED: 'action_required',
  ERROR: 'error',
} as const;

/**
 * reason field for agent payloads (why the command failed or needs action).
 * Includes common cross-command values (not_linked, not_found, api_error, etc.)
 * so routes, env, flags, domains can adopt this file when adding non-interactive mode.
 */
export const AGENT_REASON = {
  // Common (use across dns, flags, routes, env, domains, link)
  MISSING_ARGUMENTS: 'missing_arguments',
  INVALID_ARGUMENTS: 'invalid_arguments',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  NOT_LINKED: 'not_linked',
  NOT_FOUND: 'not_found',
  MISSING_SCOPE: 'missing_scope',
  API_ERROR: 'api_error',
  // Env
  MISSING_REQUIREMENTS: 'missing_requirements',
  MISSING_NAME: 'missing_name',
  MISSING_VALUE: 'missing_value',
  MISSING_ENVIRONMENT: 'missing_environment',
  ENV_NOT_FOUND: 'env_not_found',
  MULTIPLE_ENVS: 'multiple_envs',
  ENV_FILE_EXISTS: 'env_file_exists',
  GIT_BRANCH_REQUIRED: 'git_branch_required',
  ENV_KEY_SENSITIVE: 'env_key_sensitive',
  // Routes
  AMBIGUOUS_ROUTE: 'ambiguous_route',
  // DNS
  DOMAIN_NOT_FOUND: 'domain_not_found',
  DNS_RECORD_NOT_FOUND: 'dns_record_not_found',
  INCOMPLETE_RECORD: 'incomplete_record',
  PERMISSION_DENIED: 'permission_denied',
  INVALID_PORT: 'invalid_port',
  INVALID_DNS_TYPE: 'invalid_dns_type',
  DNS_ADD_FAILED: 'dns_add_failed',
  INVALID_DOMAIN: 'invalid_domain',
} as const;

/** action field for ActionRequiredPayload (what kind of action is needed) */
export const AGENT_ACTION = {
  MISSING_ARGUMENTS: 'missing_arguments',
  CONFIRMATION_REQUIRED: 'confirmation_required',
} as const;

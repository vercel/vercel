/**
 * Global constants for non-interactive agent payloads (status, reason, action).
 * Use these in outputAgentError and outputActionRequired so values stay consistent
 * across commands (redirects, routes, dns, env, etc.) and can be documented as a single source of truth.
 */

export const AGENT_STATUS = {
  ERROR: 'error',
  ACTION_REQUIRED: 'action_required',
  OK: 'ok',
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
  INTERACTIVE_CONFIRMATION_REQUIRED: 'interactive_confirmation_required',
  LOGIN_REQUIRED: 'login_required',
  PROJECT_SETTINGS_REQUIRED: 'project_settings_required',
  NOT_LINKED: 'not_linked',
  NOT_FOUND: 'not_found',
  PROJECT_NOT_FOUND: 'project_not_found',
  MISSING_SCOPE: 'missing_scope',
  SCOPE_NOT_ACCESSIBLE: 'scope_not_accessible',
  /** Agents can't change the team saved for the human (`vercel switch`). */
  AGENT_CANNOT_SWITCH: 'agent_cannot_switch',
  API_ERROR: 'api_error',
  STDIN_ERROR: 'stdin_error',
  RATE_LIMITED: 'rate_limited',
  /** A request never got a response (offline, DNS, timeout). */
  NETWORK_ERROR: 'network_error',
  /** An argument names a command that doesn't exist. Usage error. */
  UNKNOWN_COMMAND: 'unknown_command',
  // Flags
  SEGMENT_IN_USE: 'segment_in_use',
  ENTITY_IN_USE: 'entity_in_use',
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
  ROUTE_CREATE_FAILED: 'route_create_failed',
  ROUTE_GENERATION_FAILED: 'route_generation_failed',
  // DNS
  DOMAIN_NOT_FOUND: 'domain_not_found',
  /** `--amount` no longer matches the price of a domain purchase or renewal */
  PRICE_CHANGED: 'price_changed',
  /** Two selectors (e.g. `VERCEL_ORG_ID` and `--scope`) name different teams */
  CONFLICT: 'conflict',
  DOMAIN_NOT_AVAILABLE: 'domain_not_available',
  TLD_NOT_SUPPORTED: 'tld_not_supported',
  PAYMENT_FAILED: 'payment_failed',
  /** A charge may or may not have gone through; inspect before retrying */
  UNKNOWN_OUTCOME: 'unknown_outcome',
  DNS_RECORD_NOT_FOUND: 'dns_record_not_found',
  INCOMPLETE_RECORD: 'incomplete_record',
  PERMISSION_DENIED: 'permission_denied',
  INVALID_PORT: 'invalid_port',
  INVALID_DNS_TYPE: 'invalid_dns_type',
  DNS_ADD_FAILED: 'dns_add_failed',
  INVALID_DOMAIN: 'invalid_domain',
  CONFIGURED_CORRECTLY: 'configured_correctly',
  VERIFICATION_NEEDED: 'verification_needed',
  INVALID_CONFIGURATION: 'invalid_configuration',
  DNS_CHANGE_REQUIRED: 'dns_change_required',
  DNS_CHANGE_RECOMMENDED: 'dns_change_recommended',
  DNSSEC_NEEDS_TO_BE_DISABLED: 'dnssec_needs_to_be_disabled',
  PROJECT_ATTACHMENT_RECOMMENDED: 'project_attachment_recommended',
  PROJECT_DOMAIN_MISSING: 'project_domain_missing',
  /** User must accept marketplace integration terms in the browser before install can continue. */
  INTEGRATION_TERMS_ACCEPTANCE_REQUIRED:
    'integration_terms_acceptance_required',
  /** Marketplace provisioning needs a browser step (plan, billing, or other setup) before the resource exists. */
  INTEGRATION_SETUP_REQUIRED: 'integration_setup_required',
  /** Integration uninstall blocked because team-scoped resources still exist. */
  HAS_RESOURCES: 'has_resources',
  /** User must claim a sandbox marketplace resource (e.g. Stripe, Shopify) in the browser. */
  INTEGRATION_SANDBOX_CLAIM_REQUIRED: 'integration_sandbox_claim_required',
  // Tokens
  CLASSIC_TOKEN_REQUIRED: 'classic_token_required',
  /** Classic token lacks full user/account scope (e.g. team- or product-scoped token). */
  TOKEN_USER_SCOPE_REQUIRED: 'token_user_scope_required',
  // Webhooks
  MISSING_URL: 'missing_url',
  MISSING_EVENTS: 'missing_events',
  INVALID_URL: 'invalid_url',
  INVALID_EVENT: 'invalid_event',
  // AI Gateway
  INVALID_BUDGET: 'invalid_budget',
  INVALID_REFRESH_PERIOD: 'invalid_refresh_period',
  INVALID_EXPIRATION: 'invalid_expiration',
  INVALID_ALERT_THRESHOLDS: 'invalid_alert_thresholds',
  /**
   * Every selected agent needs explicit `--agent`/`--all` consent (see the
   * payload's skipped[]). `--yes` does not grant it, so this is deliberately
   * not `confirmation_required` — re-running with --yes would loop forever.
   */
  REQUIRES_CONSENT: 'requires_consent',
  // KMS
  MISSING_ISSUER_ID: 'missing_issuer_id',
  MISSING_KEY: 'missing_key',
  MISSING_KEY_ID: 'missing_key_id',
  MISSING_PROJECT: 'missing_project',
  ISSUER_NOT_FOUND: 'issuer_not_found',
  /** The issuer is provisioned by another Vercel service and is read-only here. */
  ISSUER_MANAGED: 'issuer_managed',
  /** Keys for an imported issuer must be imported too, so `add-key` cannot serve it. */
  ISSUER_REQUIRES_IMPORTED_KEY: 'issuer_requires_imported_key',
  /** Vercel generates the keys for this issuer, so `import-key` cannot serve it. */
  ISSUER_REQUIRES_GENERATED_KEY: 'issuer_requires_generated_key',
  /** Immediate revocation only applies to a key already scheduled for revocation. */
  KEY_NOT_REVOKING: 'key_not_revoking',
  NO_CHANGES_REQUESTED: 'no_changes_requested',
  // Vercel CI
  GIT_REPOSITORY_REQUIRED: 'git_repository_required',
  CI_RUN_NOT_FOUND: 'ci_run_not_found',
  CI_RUN_IN_PROGRESS: 'ci_run_in_progress',
  CI_RUN_NOT_RETRYABLE: 'ci_run_not_retryable',
  // Schedules
  SCHEDULES_NOT_ENABLED: 'schedules_not_enabled',
  SCHEDULE_ALREADY_EXISTS: 'schedule_already_exists',
  SCHEDULE_SINGLE_AT_PASSED: 'schedule_single_at_passed',
  SCHEDULE_ALREADY_ACTIVE: 'schedule_already_active',
  STATIC_SCHEDULE: 'static_schedule',
  INVALID_CRON_EXPRESSION: 'invalid_cron_expression',
  INVALID_JITTER: 'invalid_jitter',
  JITTER_EXCEEDS_CADENCE: 'jitter_exceeds_cadence',
  SINGLE_AT_TOO_SOON: 'single_at_too_soon',
  SCHEDULE_PAYLOAD_TOO_LARGE: 'payload_too_large',
  SCHEDULE_PAYLOAD_STORE_FAILED: 'payload_store_failed',
  SCHEDULE_SERVICE_UNAVAILABLE: 'service_unavailable',
  SCHEDULE_SERVICE_ERROR: 'service_error',
  // Redirects
  REDIRECT_NOT_FOUND: 'redirect_not_found',
  VERSION_NOT_FOUND: 'version_not_found',
  VERSION_ALREADY_LIVE: 'version_already_live',
  VERSION_IS_STAGING: 'version_is_staging',
  PLAN_UPGRADE_REQUIRED: 'plan_upgrade_required',
  /** The account's plan doesn't include the feature, or a plan limit was reached */
  PLAN_LIMIT: 'plan_limit',
  NOT_TEAM_MEMBER: 'not_team_member',
  INVALID_ROLE_COMBINATION: 'invalid_role_combination',
  // Logs
  TARGET_CONFLICT: 'target_conflict',
  // Warning reasons (JSON `warnings` entries and JSONL `warning` lines)
  DEPRECATED: 'deprecated',
  LIMIT_CLAMPED: 'limit_clamped',
  METRICS_UNAVAILABLE: 'metrics_unavailable',
  STREAM_GAP: 'stream_gap',
  /** A list couldn't be read in full, so some items may be missing */
  INCOMPLETE_RESULTS: 'incomplete_results',
} as const;

/**
 * Reasons for input the CLI rejected before doing any work: an unknown or
 * malformed flag, a missing or invalid argument. These are usage errors and
 * exit with code 2; every other failure exits with code 1.
 */
const USAGE_ERROR_REASONS: ReadonlySet<string> = new Set([
  'invalid_arguments',
  'missing_arguments',
  'unknown_command',
  'missing_command',
  'invalid_environment',
  'invalid_type',
  'missing_id',
  'missing_value',
  'missing_name',
  'missing_flags',
  'missing_clients',
  'invalid_clients',
  'conflicting_type_flags',
  'missing_environment',
  'invalid_slug',
  'invalid_name',
  'invalid_alert_thresholds',
  'invalid_budget',
  'invalid_dns_type',
  'invalid_event',
  'invalid_expiration',
  'invalid_port',
  'invalid_refresh_period',
  'invalid_role_combination',
  'invalid_url',
  'missing_events',
  'missing_issuer_id',
  'missing_key_id',
  'missing_key',
  'missing_url',
]);

/** The exit code for a failure: 2 for a usage error, 1 for anything else. */
export function getExitCodeForReason(reason: string | undefined): number {
  return reason !== undefined && USAGE_ERROR_REASONS.has(reason) ? 2 : 1;
}

/** action field for ActionRequiredPayload (what kind of action is needed) */
export const AGENT_ACTION = {
  MISSING_ARGUMENTS: 'missing_arguments',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  LOGIN_REQUIRED: 'login_required',
} as const;

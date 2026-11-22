import chalk from 'chalk';
import output from '../../output-manager';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import type Client from '../../util/client';
import { wantsMachineReadableOutput } from '../../util/output-format';
import { getCommandNamePlain } from '../../util/pkg-name';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import {
  ENV_VAR_PREFIX_PATTERN,
  normalizeEnvVarPrefix,
} from '../../util/storage/env-vars';
import { formatStoragePlan, type StoragePlan } from '../../util/storage/plan';
import { storeMatchesType, storeTypeName } from '../../util/storage/providers';
import {
  getStorageStores,
  resolveStore,
  type StorageStore,
} from '../../util/storage/store';
import {
  VALID_ENVIRONMENTS,
  validateEnvironments,
} from '../../util/integration/post-provision-setup';

export interface StorageScope {
  project: { id: string; name: string };
  accountId: string | undefined;
  /** Team (or user) slug, for `--scope` in suggested commands. */
  teamSlug: string | undefined;
}

/**
 * Emits a structured payload for agents, then the human error. Always fails.
 *
 * `outputAgentError` only writes JSON in non-interactive mode, so a caller that
 * asked for `--json` interactively would otherwise get nothing parseable on
 * stdout. The same payload is written in that case, keeping stdout JSON-only.
 */
export function failWith(
  client: Client,
  {
    reason,
    message,
    hint,
    next,
  }: {
    reason: string;
    message: string;
    hint?: string;
    next?: Array<{ command: string; when?: string }>;
  }
): number {
  const payload = {
    status: AGENT_STATUS.ERROR,
    reason,
    message,
    ...(hint ? { hint } : {}),
    ...(next ? { next } : {}),
  };
  outputAgentError(client, payload);
  if (wantsMachineReadableOutput(undefined, client.argv)) {
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }
  output.error(message);
  if (hint) {
    output.log(hint);
  }
  return getExitCodeForReason(reason);
}

/**
 * Resolves the project a storage mutation targets: `--project` when given,
 * otherwise the linked project.
 */
export async function resolveStorageScope(
  client: Client,
  projectNameOrId: string | undefined
): Promise<StorageScope | number> {
  const link = await resolveProjectContext({
    client,
    projectNameOrId,
  });

  if (link.status === 'error') {
    return link.exitCode;
  }

  if (link.status === 'not_linked') {
    return failWith(client, {
      reason: AGENT_REASON.NOT_LINKED,
      message:
        'No project resolved. Pass --project <name-or-id>, or link this directory first.',
      next: [
        {
          command: getCommandNamePlain('link'),
          when: 'link this directory to a project',
        },
      ],
    });
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return {
    project: { id: link.project.id, name: link.project.name },
    accountId: link.org.id,
    teamSlug: link.org.slug,
  };
}

export interface StorageAccount {
  accountId: string | undefined;
  teamSlug: string | undefined;
  /** Set when the current directory is linked to a project. */
  linkedProject: { id: string; name: string } | undefined;
}

/**
 * Resolves the team (or personal account) that store lifecycle commands
 * operate on. Stores are team-scoped, not project-scoped, so this prefers the
 * linked project's team — matching `vercel env`, `vercel global-config`, and
 * friends — and falls back to the globally configured team (or `--scope`) so
 * the commands stay usable from any directory.
 */
export async function resolveStorageAccount(
  client: Client
): Promise<StorageAccount | number> {
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'linked') {
    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;
    return {
      accountId: link.org.id,
      teamSlug: link.org.slug,
      linkedProject: { id: link.project.id, name: link.project.name },
    };
  }

  const { team } = await getScope(client);
  client.config.currentTeam = team?.id;
  return {
    accountId: team?.id,
    teamSlug: team?.slug,
    linkedProject: undefined,
  };
}

/** `itemCount` → `Item Count`, `baseUrl` → `Base URL`. */
export function labelFor(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\burl\b/i, 'URL')
    .replace(/\bid\b/i, 'ID')
    .replace(/^./, first => first.toUpperCase());
}

/** Resolves one resource identifier across every store type. */
export async function resolveStorageStore(
  client: Client,
  identifier: string,
  accountId: string | undefined,
  options: { type?: string } = {}
): Promise<StorageStore | number> {
  output.spinner('Retrieving storage resources…', 500);
  let stores: StorageStore[];
  try {
    stores = await getStorageStores(client, { accountId });
  } finally {
    output.stopSpinner();
  }

  // Different products can share a name (a Blob store and a Global Config both
  // called `uploads`), so `--type` narrows the candidates before matching.
  if (options.type) {
    stores = stores.filter(store => storeMatchesType(store, options.type!));
  }

  const result = resolveStore(stores, identifier);

  if (result.status === 'found') {
    return result.store;
  }

  if (result.status === 'ambiguous') {
    const candidates = result.matches
      .map(store => `${store.id} (${storeTypeName(store)})`)
      .join(', ');
    return failWith(client, {
      reason: 'ambiguous_store',
      message: `More than one storage resource is named ${identifier}: ${candidates}. Pass --type <type> or a store ID instead.`,
    });
  }

  return failWith(client, {
    reason: AGENT_REASON.NOT_FOUND,
    message: `No storage resource ${identifier} found in this scope.`,
    next: [
      {
        command: getCommandNamePlain('storage list'),
        when: 'list the storage resources in this scope',
      },
    ],
  });
}

export type EnvironmentsResult =
  | { valid: true; environments: string[]; explicit: boolean }
  | { valid: false; message: string };

/** Validates `--environment`, defaulting to every system environment. */
export function resolveEnvironments(
  environmentFlags: string[] | undefined
): EnvironmentsResult {
  if (!environmentFlags?.length) {
    return {
      valid: true,
      environments: [...VALID_ENVIRONMENTS],
      explicit: false,
    };
  }

  const validation = validateEnvironments(environmentFlags);
  if (!validation.valid) {
    return {
      valid: false,
      message: `Invalid environment value: ${validation.invalid
        .map(value => `"${value}"`)
        .join(', ')}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}.`,
    };
  }

  return {
    valid: true,
    environments: [...new Set(environmentFlags)],
    explicit: true,
  };
}

export type PrefixResult =
  | { valid: true; prefix: string | undefined }
  | { valid: false; message: string };

export function resolvePrefix(prefix: string | undefined): PrefixResult {
  if (prefix === undefined) {
    return { valid: true, prefix: undefined };
  }
  if (!ENV_VAR_PREFIX_PATTERN.test(prefix)) {
    return {
      valid: false,
      message:
        'Invalid --prefix value. It must start with a letter and contain only letters, digits, and underscores.',
    };
  }
  return { valid: true, prefix: normalizeEnvVarPrefix(prefix) };
}

/**
 * Prints the change plan. Every mutating subcommand does this before touching
 * anything, so the exact env var changes are always on the record — as JSON
 * when the caller asked for it, as text otherwise.
 */
export function printStoragePlan(
  client: Client,
  plan: StoragePlan,
  asJson: boolean
): void {
  if (asJson) {
    client.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  output.print(formatStoragePlan(plan));
}

/**
 * Confirms a mutation. Returns `true` to proceed, `false` when the user
 * declined, and a number when the command should exit with that code.
 */
export async function confirmStorageChange(
  client: Client,
  {
    skipConfirmation,
    question,
  }: { skipConfirmation: boolean; question: string }
): Promise<boolean | number> {
  if (skipConfirmation) {
    return true;
  }

  if (client.nonInteractive || !client.stdin.isTTY) {
    return failWith(client, {
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      message: 'This change requires confirmation. Re-run with --yes.',
      next: [{ command: buildCommandWithYes(client.argv) }],
    });
  }

  return client.input.confirm(chalk.cyan(question), true);
}

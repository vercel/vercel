import chalk from 'chalk';
import { formatAlignedLabel } from '../output/print-aligned-label';
import {
  describeStorageAuth,
  type EffectiveStorageAuth,
  type ResolvedStorageAuth,
  type StorageAuthMode,
} from './auth';
import type { EnvVarChangePlan, EnvVarNameSource } from './env-vars';
import { storeProductLabel, type StorageStore } from './store';

export type StoragePlanAction = 'connect' | 'update' | 'disconnect';

export interface StoragePlanProject {
  id: string;
  name: string;
}

export interface StoragePlanAuth {
  requested: StorageAuthMode;
  effective: EffectiveStorageAuth;
  readWriteToken: boolean;
}

/**
 * The change a `storage` mutation is about to make, in a shape that is stable
 * enough for agents to diff. Every mutating subcommand prints this before it
 * touches anything, and `--dry-run` stops right after printing it.
 */
export interface StoragePlan {
  action: StoragePlanAction;
  dryRun: boolean;
  store: {
    id: string;
    name: string;
    type: string;
    product: string;
  };
  projects: StoragePlanProject[];
  environments: string[];
  envVarPrefix: string | null;
  auth?: StoragePlanAuth;
  envVars: {
    add: string[];
    remove: string[];
    keep: string[];
    /** Whether the names above are exact — see {@link EnvVarNameSource}. */
    source: EnvVarNameSource;
    notes: string[];
  };
}

export function buildStoragePlan({
  action,
  dryRun,
  store,
  projects,
  environments,
  envVarPrefix,
  auth,
  envVars,
}: {
  action: StoragePlanAction;
  dryRun: boolean;
  store: StorageStore;
  projects: StoragePlanProject[];
  environments: string[];
  envVarPrefix?: string;
  auth?: ResolvedStorageAuth;
  envVars: EnvVarChangePlan;
}): StoragePlan {
  return {
    action,
    dryRun,
    store: {
      id: store.id,
      name: store.name,
      type: store.type ?? 'unknown',
      product: storeProductLabel(store),
    },
    projects,
    environments,
    envVarPrefix: envVarPrefix ?? null,
    ...(auth
      ? {
          auth: {
            requested: auth.requested,
            effective: auth.effective,
            readWriteToken: auth.readWriteToken,
          },
        }
      : {}),
    envVars: {
      add: envVars.add,
      remove: envVars.remove,
      keep: envVars.keep,
      source: envVars.source,
      notes: [...(auth?.notes ?? []), ...envVars.notes],
    },
  };
}

const ACTION_TITLES: Record<StoragePlanAction, string> = {
  connect: 'Storage connect plan',
  update: 'Storage update plan',
  disconnect: 'Storage disconnect plan',
};

/** Human-readable rendering of a {@link StoragePlan}. */
export function formatStoragePlan(plan: StoragePlan): string {
  const lines: string[] = [
    `${chalk.bold(ACTION_TITLES[plan.action])}${plan.dryRun ? chalk.dim(' (dry run)') : ''}`,
    formatAlignedLabel(
      'Store',
      `${plan.store.name} ${chalk.dim(`(${plan.store.id})`)} · ${plan.store.product}`
    ),
    formatAlignedLabel(
      plan.projects.length === 1 ? 'Project' : 'Projects',
      plan.projects.length
        ? plan.projects
            .map(project => `${project.name} ${chalk.dim(`(${project.id})`)}`)
            .join(', ')
        : chalk.dim('none')
    ),
  ];

  if (plan.environments.length) {
    lines.push(
      formatAlignedLabel('Environments', plan.environments.join(', '))
    );
  }

  lines.push(
    formatAlignedLabel(
      'Prefix',
      plan.envVarPrefix ?? chalk.dim('none (product default)')
    )
  );

  if (plan.auth) {
    lines.push(
      formatAlignedLabel('Credentials', describeStorageAuth(plan.auth))
    );
  }

  const changes = [
    ...plan.envVars.add.map(name => chalk.green(`+ ${name}`)),
    ...plan.envVars.remove.map(name => chalk.red(`- ${name}`)),
    ...plan.envVars.keep.map(name => chalk.dim(`= ${name}`)),
  ];

  if (changes.length) {
    lines.push(formatAlignedLabel('Env vars', changes[0]));
    for (const change of changes.slice(1)) {
      lines.push(formatAlignedLabel('', change));
    }
  } else {
    lines.push(
      formatAlignedLabel(
        'Env vars',
        chalk.dim(
          plan.envVars.source === 'provider'
            ? 'names unavailable'
            : 'no changes'
        )
      )
    );
  }

  for (const note of plan.envVars.notes) {
    lines.push(formatAlignedLabel('Note', chalk.dim(note)));
  }

  return `${lines.join('\n')}\n`;
}

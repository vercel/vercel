import chalk from 'chalk';
import { readFile, writeFile } from 'fs/promises';
import { basename } from 'path';
import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parse as parseJsonc,
  parseTree,
  type ParseError,
} from 'jsonc-parser';
import { stringify as tomlStringify } from 'smol-toml';
import {
  isExperimentalService,
  type ExperimentalService,
} from '@vercel/build-utils';
import { LocalFileSystemDetector } from '@vercel/fs-detectors';
import {
  hasLegacyServicesConfig,
  migrateExperimentalServices,
  type DetectServicesResult,
  type ExperimentalServicesMigrationPlan,
  type LegacyServicesConfig,
} from '@vercel-internals/service-topology';
import output from '../../output-manager';
import type Client from '../client';
import {
  compileVercelConfig,
  findSourceVercelConfigFile,
} from '../compile-vercel-config';
import code from '../output/code';
import renderLink from '../output/link';
import { printAlignedLabel } from '../output/print-aligned-label';
import { validateConfig } from '../validate-config';

const EXPERIMENTAL_SERVICES_DOCS_URL =
  'https://vercel.com/docs/services/experimental';

export interface ServicesMigrationPreparation {
  plan: ExperimentalServicesMigrationPlan;
  sourceFile: string;
  snippet: string;
  write?: {
    configPath: string;
    content: string;
  };
  writeBlocker?: string;
}

/**
 * Prepare a migration from `experimentalServices` to `services`.
 */
export async function prepareExperimentalServicesMigration(
  cwd: string,
  detectServicesResult?: DetectServicesResult | null
): Promise<ServicesMigrationPreparation | null> {
  const compileResult = await compileVercelConfig(cwd);
  if (!compileResult.configPath) {
    return null;
  }

  const rawConfig = await readFile(compileResult.configPath, 'utf8');
  const config = parseJsonc(rawConfig) as LegacyServicesConfig | undefined;
  if (!config || !hasLegacyServicesConfig(config)) {
    return null;
  }

  // Reuse the resolution the caller already did, when it came from config.
  const resolvedServices =
    detectServicesResult?.resolved?.source === 'configured'
      ? detectServicesResult.services.filter((s): s is ExperimentalService =>
          isExperimentalService(s)
        )
      : undefined;

  const plan = await migrateExperimentalServices({
    fs: new LocalFileSystemDetector(cwd),
    config,
    resolvedServices:
      resolvedServices && resolvedServices.length > 0
        ? resolvedServices
        : undefined,
  });

  const sourceFile =
    compileResult.sourceFile ?? basename(compileResult.configPath);
  const preparation: ServicesMigrationPreparation = {
    plan,
    sourceFile,
    snippet: renderSnippet(sourceFile, plan),
  };

  if (plan.errors.length > 0) {
    return preparation;
  }

  if (compileResult.wasCompiled) {
    preparation.writeBlocker = `${sourceFile} can't be updated automatically.`;
    return preparation;
  }

  const content = applyPlanToJson(rawConfig, config, plan);
  const parseErrors: ParseError[] = [];
  const nextConfig = parseJsonc(content, parseErrors);
  if (parseErrors.length > 0) {
    preparation.writeBlocker = `Couldn't produce a valid ${sourceFile}.`;
    return preparation;
  }
  const validationError = validateConfig(nextConfig);
  if (validationError) {
    preparation.writeBlocker = validationError.message;
    return preparation;
  }

  preparation.write = { configPath: compileResult.configPath, content };
  return preparation;
}

export function applyPlanToJson(
  rawConfig: string,
  config: LegacyServicesConfig,
  plan: ExperimentalServicesMigrationPlan
): string {
  const eol = rawConfig.includes('\r\n') ? '\r\n' : '\n';
  const indent = /^([ \t]+)\S/m.exec(rawConfig)?.[1] ?? '  ';
  const formattingOptions = {
    eol,
    insertSpaces: !indent.startsWith('\t'),
    tabSize: indent.startsWith('\t') ? 1 : indent.length,
  };
  const legacyKey = config.experimentalServices
    ? 'experimentalServices'
    : 'experimentalServicesV2';
  // Rename the key in place so removing earlier build settings cannot shift it.
  const key = findNodeAtLocation(parseTree(rawConfig)!, [legacyKey])!.parent!
    .children![0];
  let text = applyEdits(rawConfig, [
    { offset: key.offset, length: key.length, content: '"services"' },
  ]);
  text = applyEdits(
    text,
    modify(text, ['services'], plan.patch.services, { formattingOptions })
  );

  for (const key of plan.removeKeys) {
    if (key !== legacyKey) {
      text = applyEdits(
        text,
        modify(text, [key], undefined, { formattingOptions })
      );
    }
  }

  for (const [key, value] of Object.entries(plan.patch.build?.env ?? {})) {
    text = applyEdits(
      text,
      modify(text, ['build', 'env', key], value, { formattingOptions })
    );
  }

  if (plan.patch.rewrites.length > 0) {
    if (Array.isArray(config.rewrites)) {
      for (const rewrite of plan.patch.rewrites) {
        text = applyEdits(
          text,
          modify(text, ['rewrites', -1], rewrite, { formattingOptions })
        );
      }
    } else {
      text = applyEdits(
        text,
        modify(text, ['rewrites'], plan.patch.rewrites, {
          formattingOptions,
          getInsertionIndex: keys => keys.indexOf('services') + 1,
        })
      );
    }
  }

  return text.endsWith('\n') ? text : `${text}${eol}`;
}

function renderSnippet(
  sourceFile: string,
  plan: ExperimentalServicesMigrationPlan
): string {
  const patch: Record<string, unknown> = { services: plan.patch.services };
  if (plan.patch.rewrites.length > 0) {
    patch.rewrites = plan.patch.rewrites;
  }
  if (plan.patch.build) patch.build = plan.patch.build;
  if (sourceFile === 'vercel.toml') {
    return tomlStringify(patch).trimEnd();
  }
  return JSON.stringify(patch, null, 2);
}

/**
 * Show the suggested `services` config, the behavior differences to review,
 * and anything that has to be migrated by hand.
 */
export function displayExperimentalServicesMigration(
  preparation: ServicesMigrationPreparation
): void {
  const { plan, sourceFile, snippet } = preparation;
  const legacyKey = plan.removeKeys.includes('experimentalServices')
    ? 'experimentalServices'
    : 'experimentalServicesV2';

  output.print(
    `${chalk.yellow('!')} ${sourceFile} uses ${code(legacyKey)}, which is replaced by ${code(
      'services'
    )}. ${renderLink(EXPERIMENTAL_SERVICES_DOCS_URL)}\n`
  );

  if (plan.errors.length > 0) {
    output.print(
      `  ${chalk.bold(`Can't migrate ${sourceFile} automatically:`)}\n`
    );
    for (const error of plan.errors) {
      output.print(`  ${chalk.red('✗')} ${error.message}\n`);
    }
    return;
  }

  output.print(`\n  ${chalk.bold(`Suggested ${sourceFile} configuration:`)}\n`);
  output.print(`${indent(snippet, 2)}\n`);
  if (plan.patch.build && !preparation.write) {
    output.print(
      '  Merge these `build.env` defaults with any existing build settings.\n'
    );
  }

  const removed = plan.removeKeys.filter(k => k !== legacyKey);
  if (removed.length > 0) {
    output.print(
      `\n  Also removes top-level ${removed.map(k => code(k)).join(', ')}.\n`
    );
  }
  for (const rename of plan.renamedServices) {
    output.print(
      `  Service ${code(rename.from)} is renamed to ${code(rename.to)}.\n`
    );
  }

  for (const [heading, notes] of [
    ['Review before deploying:', plan.warnings],
    ['Not migrated:', plan.unmigrated],
  ] as const) {
    if (notes.length > 0) {
      output.print(`\n  ${chalk.bold(heading)}\n`);
      for (const note of notes) {
        const link = note.link ? ` ${renderLink(note.link)}` : '';
        output.print(`${chalk.yellow('!')} ${note.message}${link}\n`);
      }
    }
  }
  output.print('\n');
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map(line => `${pad}${line}`)
    .join('\n');
}

export interface PromptExperimentalServicesMigrationOptions {
  client: Client;
  cwd: string;
  autoConfirm?: boolean;
  nonInteractive?: boolean;
  /** Disable execution of JS/TS config during data-only operations like link. */
  allowConfigExecution?: boolean;
  detectServicesResult?: DetectServicesResult | null;
}

/**
 * Suggest migrating a legacy services config and, with approval, rewrite
 * `vercel.json`. Returns true when the config file was updated.
 *
 * Non-interactive runs only print the suggestion unless explicitly confirmed.
 */
export async function promptExperimentalServicesMigration({
  client,
  cwd,
  autoConfirm = false,
  nonInteractive = false,
  allowConfigExecution = true,
  detectServicesResult,
}: PromptExperimentalServicesMigrationOptions): Promise<boolean> {
  let preparation: ServicesMigrationPreparation | null;
  try {
    if (!allowConfigExecution) {
      const sourceFile = await findSourceVercelConfigFile(cwd);
      if (sourceFile && sourceFile !== 'vercel.toml') {
        return false;
      }
    }
    preparation = await prepareExperimentalServicesMigration(
      cwd,
      detectServicesResult
    );
  } catch (error) {
    output.debug(`Skipping services migration suggestion: ${error}`);
    return false;
  }
  if (!preparation) {
    return false;
  }

  displayExperimentalServicesMigration(preparation);

  if (preparation.plan.errors.length > 0) {
    return false;
  }

  if (!preparation.write) {
    if (preparation.writeBlocker) {
      output.print(
        `  ${preparation.writeBlocker} Apply the configuration above to ${preparation.sourceFile} manually.\n\n`
      );
    }
    return false;
  }

  const interactive = client.stdin.isTTY && !nonInteractive;
  let confirmed = autoConfirm;
  if (!confirmed && interactive) {
    confirmed = await client.input.confirm(
      `Update ${preparation.sourceFile} with this configuration?`,
      true
    );
  }
  if (!confirmed) {
    if (!interactive && !autoConfirm) {
      output.print(
        `  Run this command in a terminal to apply it, pass ${code('--yes')} to accept the migration, or update ${preparation.sourceFile} manually.\n\n`
      );
    }
    return false;
  }

  await writeFile(
    preparation.write.configPath,
    preparation.write.content,
    'utf8'
  );
  printAlignedLabel('Updated', preparation.sourceFile, { gutter: '✓' });
  if (preparation.plan.unmigrated.length > 0) {
    output.print(
      `  ${preparation.plan.unmigrated.length} service${
        preparation.plan.unmigrated.length === 1 ? ' was' : 's were'
      } left out. Migrate ${
        preparation.plan.unmigrated.length === 1 ? 'it' : 'them'
      } manually before deploying.\n`
    );
  }
  output.print('\n');
  return true;
}

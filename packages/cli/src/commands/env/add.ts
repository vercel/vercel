import chalk from 'chalk';
import type { CustomEnvironment, ProjectLinked } from '@vercel-internals/types';
import type Client from '../../util/client';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import {
  getEnvTargetPlaceholder,
  envTargetChoices,
  isValidEnvTarget,
  parseEnvTargetArg,
} from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import { CHECKBOX_INSTRUCTIONS } from '../../util/input/checkbox-instructions';
import param from '../../util/output/param';
import { isKnownError } from '../../util/env/known-error';
import {
  getEnvKeyWarnings,
  getApiPublicPrefix,
  getFrameworkPublicPrefix,
  getLocalSvelteKitPublicPrefixes,
  getPublicPrefix,
  normalizeStdinEnvValue,
  removePublicPrefix,
  validateEnvValue,
} from '../../util/env/validate-env';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import output from '../../output-manager';
import { EnvAddTelemetryClient } from '../../util/telemetry/commands/env/add';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { addSubcommand } from './command';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { determineAgent } from '@vercel/detect-agent';
import { suggestNextCommands } from '../../util/suggest-next-commands';
import { isGuidanceEnabled } from '../../util/guidance/is-enabled';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { quoteArg } from '../../util/flags/quote-arg';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvAddCommandWithPreservedArgs,
  getPreservedArgsForEnvAdd,
  withGlobalFlags,
  redactEnvValueArgs,
} from '../../util/agent-output';
import {
  ENV_VISIBILITY_DEPRECATION_MESSAGE,
  getPublicPrefixSecretVisibilityError,
  resolveEnvVarTypeOption,
  resolveEnvVarVisibility,
  type EnvVariableVisibility,
  formatVisibilityLabel,
} from '../../util/env/env-var-config-secret-ui';
import {
  isFlagsSecretNeedingSplit,
  looksLikeSecret,
  looksLikeSecretValue,
} from '../../util/env/secret-detection';
import {
  getDefaultSecretStorageGuidance,
  getProductionSecretPolicyErrorKind,
  getProductionSecretPolicyRecovery,
  getSecretStorageChoice,
} from '../../util/env/secret-storage-guidance';

type EnvType = 'encrypted' | 'sensitive';
type TypeSource = 'argv' | 'prompt' | 'inferred' | 'default';

function looksLikeCredentialName(
  key: string,
  publicPrefix: string | null | undefined = getPublicPrefix(key)
): boolean {
  return looksLikeSecret(publicPrefix ? key.slice(publicPrefix.length) : key);
}

type EnvChoice = {
  name: string;
  value: string;
  checked?: boolean;
  disabled?: boolean | string;
};

function filterEnvChoicesForSensitivity(
  choices: EnvChoice[],
  opts: {
    isSensitive: boolean;
    policyOn: boolean;
  }
): EnvChoice[] {
  if (opts.policyOn) {
    return choices.filter(c => c.value === 'development');
  }
  return choices;
}

function getTargetCompatibilityError(
  envTargets: string[],
  isSensitive: boolean,
  policyOn: boolean
): string | null {
  const hasSensitiveCapable = envTargets.some(t => t !== 'development');

  if (!isSensitive && policyOn && hasSensitiveCapable) {
    return `Your team requires sensitive Environment Variables for Production and Preview. To add a non-sensitive value, target the Development Environment only. Run ${getCommandName(
      'env add'
    )} with the development target instead.`;
  }

  return null;
}

function resolveFinalType(
  envTargets: string[],
  isSensitive: boolean,
  opts: {
    forceSensitive: boolean;
    forceEncrypted: boolean;
    policyOn: boolean;
  }
): EnvType {
  const hasDevelopment = envTargets.includes('development');
  if (hasDevelopment && !isSensitive) {
    return 'encrypted';
  }
  if (opts.forceEncrypted && !opts.policyOn) {
    return 'encrypted';
  }
  if (isSensitive || opts.forceSensitive || opts.policyOn) {
    return 'sensitive';
  }
  return 'encrypted';
}

/**
 * Replaces safe placeholders in an env add command template. Secret values stay
 * as placeholders so suggested commands never echo them.
 *
 * Placeholders: `<name>` (env key), `<git-branch>`, target placeholder from
 * `getEnvTargetPlaceholder()`, and `<value>`.
 */
function fillEnvAddTemplate(
  template: string,
  opts: {
    envName?: string;
    envTargetArg?: string;
    envGitBranch?: string;
  }
): string {
  const targetPlaceholder = getEnvTargetPlaceholder();
  return template
    .replace(/<name>/g, opts.envName ? quoteArg(opts.envName) : '<name>')
    .split(targetPlaceholder)
    .join(opts.envTargetArg ? quoteArg(opts.envTargetArg) : targetPlaceholder)
    .replace(
      /<git-branch>/g,
      opts.envGitBranch ? quoteArg(opts.envGitBranch) : '<git-branch>'
    )
    .replace(
      /<gitbranch>/g,
      opts.envGitBranch ? quoteArg(opts.envGitBranch) : '<gitbranch>'
    )
    .replace(/<value>/g, '<value>');
}

function multiTargetSuggestion(
  argv: string[],
  envName: string,
  targets: string[],
  addNoSensitive: boolean
): { command: string; when: string } {
  const flag = addNoSensitive ? ' --no-sensitive' : '';
  return {
    command: buildEnvAddCommandWithPreservedArgs(
      argv,
      `env add ${envName} ${targets.join(',')} --value "<value>"${flag} --yes`
    ),
    when: addNoSensitive
      ? 'Add one non-sensitive variable to all listed environments'
      : 'Add one variable to multiple environments',
  };
}

function filterSensitiveMultiTargetSuggestionTargets(
  targets: string[],
  _opts: {
    forceSensitive: boolean;
    policyOn: boolean;
  }
): string[] {
  return targets;
}

function projectLabel(link: ProjectLinked): string {
  return `${link.org.slug}/${link.project.name}`;
}

function formatEnvironmentTarget(
  target: string,
  customEnvironments: CustomEnvironment[]
): string {
  const standardTarget = envTargetChoices.find(
    choice => choice.value === target
  );
  if (standardTarget) {
    return standardTarget.name;
  }
  const customEnvironment = customEnvironments.find(
    env => env.id === target || env.slug === target
  );
  return customEnvironment?.slug ?? target;
}

function formatEnvironmentTargets(
  envTargets: string[],
  customEnvironments: CustomEnvironment[]
): string {
  return envTargets
    .map(target => formatEnvironmentTarget(target, customEnvironments))
    .join(', ');
}

function printEnvAddResult(
  link: ProjectLinked,
  envName: string,
  envTargets: string[],
  envGitBranch: string | undefined,
  customEnvironments: CustomEnvironment[],
  finalType: EnvType,
  force: boolean,
  visibility?: EnvVariableVisibility
): void {
  output.print('\n');
  printAlignedLabel(force ? 'Overrode' : 'Added', envName, { gutter: '✓' });
  printAlignedLabel('Project', projectLabel(link));
  printAlignedLabel(
    'Environments',
    formatEnvironmentTargets(envTargets, customEnvironments)
  );
  if (envGitBranch) {
    printAlignedLabel('Branch', envGitBranch);
  }
  const visibilityLabel = formatVisibilityLabel(visibility, finalType);
  if (visibilityLabel) {
    printAlignedLabel('Type', visibilityLabel);
  }
}

function printEnvAddWarning(message: string): void {
  output.print(`${chalk.yellow('!')} ${message}\n`);
}

function promptEnvValue(
  client: Client,
  opts: { isSensitive: boolean }
): Promise<string> {
  return client.input.text({
    message: `Value?`,
    ...(opts.isSensitive
      ? { transformer: (value: string) => '*'.repeat(value.length) }
      : {}),
  });
}

function buildHumanEnvAddCommand(
  argv: string[],
  commandTemplate: string
): string {
  const globalFlags = getGlobalFlagsFromArgs(argv.slice(2), {
    preserveProject: true,
  }).filter(flag => !flag.startsWith('--non-interactive'));
  const suffix =
    globalFlags.length > 0 ? ` ${globalFlags.map(quoteArg).join(' ')}` : '';
  return getCommandNamePlain(`${commandTemplate}${suffix}`);
}

export default async function add(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: err instanceof Error ? err.message : String(err),
        },
        1
      );
    }
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  const stdInput = await readStandardInput(client.stdin);
  const valueFromFlag =
    typeof opts['--value'] === 'string' ? opts['--value'] : undefined;
  let [envName, envTargetArg] = args;
  const positionalGitBranch = args[2];
  const optionGitBranch =
    typeof opts['--git-branch'] === 'string' ? opts['--git-branch'] : undefined;
  let envGitBranch = optionGitBranch ?? positionalGitBranch;
  const forceSensitive = Boolean(opts['--sensitive']);
  const forceEncrypted = Boolean(opts['--no-sensitive']);
  const typeOption = resolveEnvVarTypeOption({
    type: typeof opts['--type'] === 'string' ? opts['--type'] : undefined,
    visibility:
      typeof opts['--visibility'] === 'string'
        ? opts['--visibility']
        : undefined,
  });
  let explicitType = typeOption.explicitVisibility;
  let typeSource: TypeSource | undefined =
    explicitType || forceSensitive || forceEncrypted ? 'argv' : undefined;

  const telemetryClient = new EnvAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliArgumentGitBranch(positionalGitBranch);
  telemetryClient.trackCliOptionGitBranch(optionGitBranch);
  telemetryClient.trackCliOptionValue(
    valueFromFlag === undefined ? undefined : '<redacted>'
  );
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagNoSensitive(opts['--no-sensitive']);
  telemetryClient.trackCliFlagForce(opts['--force']);
  telemetryClient.trackCliFlagGuidance(opts['--guidance']);
  telemetryClient.trackCliFlagYes(opts['--yes']);
  telemetryClient.trackCliOptionType(
    typeof opts['--type'] === 'string' ? opts['--type'] : undefined
  );
  telemetryClient.trackCliOptionVisibility(
    typeof opts['--visibility'] === 'string' ? opts['--visibility'] : undefined
  );
  telemetryClient.trackCliOptionProject(opts['--project']);

  if (typeOption.error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: typeOption.errorReason ?? 'invalid_type',
          message: typeOption.error,
        },
        1
      );
    }
    output.fatal(typeOption.error);
    return 1;
  }
  if (typeOption.usedDeprecatedVisibility) {
    printEnvAddWarning(ENV_VISIBILITY_DEPRECATION_MESSAGE);
  }

  const typeConflictMessage = forceSensitive
    ? forceEncrypted
      ? '`--sensitive` and `--no-sensitive` cannot be used together. Pick one.'
      : explicitType === 'config'
        ? '`--type config` cannot be used with `--sensitive`. Pick one.'
        : null
    : forceEncrypted && explicitType === 'secret'
      ? '`--type secret` cannot be used with `--no-sensitive`. Pick one.'
      : null;
  if (typeConflictMessage) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'conflicting_type_flags',
          message: typeConflictMessage,
        },
        1
      );
    }
    output.fatal(typeConflictMessage);
    return 1;
  }

  if (positionalGitBranch && optionGitBranch) {
    output.error(
      'Git branch was provided twice. Use either `--git-branch <git-branch>` or the legacy third argument.'
    );
    return 1;
  }

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()} --git-branch <git-branch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> --git-branch <git-branch> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: string[] = envTargetArg
    ? parseEnvTargetArg(envTargetArg)
    : [];
  let resolvedLink: ProjectLinked | undefined;

  // Non-interactive: resolve link and choices once, then report all missing requirements in a single JSON (no iteration)
  if (client.nonInteractive) {
    const link = await resolveProjectContext({
      client,
      projectNameOrId: opts['--project'],
    });
    if (link.status === 'error') {
      return link.exitCode;
    }
    if (link.status === 'not_linked') {
      const preserved = getPreservedArgsForEnvAdd(client.argv);
      const linkPreserved = preserved.filter((a, i) => {
        if (a === '--value') return false;
        if (a.startsWith('--value=')) return false;
        if (i > 0 && preserved[i - 1] === '--value') return false;
        return true;
      });
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        '--scope',
        '<scope>',
        ...linkPreserved,
      ];
      let envAddRetryArgv = redactEnvValueArgs(client.argv);
      if (envTargetArg === 'preview' && envGitBranch === undefined) {
        const argvArgs = client.argv.slice(2);
        const addIdx = argvArgs.indexOf('add');
        if (addIdx !== -1) {
          let pos = addIdx + 1;
          let positionals = 0;
          while (
            pos < argvArgs.length &&
            positionals < 3 &&
            !argvArgs[pos].startsWith('-')
          ) {
            positionals++;
            pos++;
          }
          const insertAt = 2 + pos;
          envAddRetryArgv = redactEnvValueArgs([
            ...client.argv.slice(0, insertAt),
            '<gitbranch>',
            ...client.argv.slice(insertAt),
          ]);
        }
      }
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run \`${getCommandNamePlain(
            'link'
          )}\` to begin. Use \`--yes\` for non-interactive mode; use \`--scope\` or \`--project\` to specify a team or project. Then run your \`env add\` command.`,
          next: [
            { command: buildCommandWithYes(linkArgv) },
            { command: buildCommandWithYes(envAddRetryArgv) },
          ],
        },
        1
      );
    }
    if (link.status !== 'linked') return 1;
    resolvedLink = link;
    const { project } = link;
    const org = link.org;
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;
    const [{ envs }, customEnvironments] = await Promise.all([
      getEnvRecords(client, project.id, 'vercel-cli:env:add'),
      getCustomEnvironments(client, project.id),
    ]);
    const matchingEnvs = envs.filter(r => r.key === envName);
    const existingTargets = new Set<string>();
    const existingCustomEnvs = new Set<string>();
    for (const env of matchingEnvs) {
      if (typeof env.target === 'string') {
        existingTargets.add(env.target);
      } else if (Array.isArray(env.target)) {
        for (const target of env.target) {
          existingTargets.add(target);
        }
      }
      if (env.customEnvironmentIds) {
        for (const customEnvId of env.customEnvironmentIds) {
          existingCustomEnvs.add(customEnvId);
        }
      }
    }
    const choices = [
      ...envTargetChoices.filter(c => !existingTargets.has(c.value)),
      ...customEnvironments
        .filter(c => !existingCustomEnvs.has(c.id))
        .map(c => ({
          name: c.slug,
          value: c.id,
        })),
    ];
    const missing: string[] = [];
    if (!envName) missing.push('missing_name');
    if (valueFromFlag === undefined && !stdInput) missing.push('missing_value');
    if (!envTargetArg && choices.length > 0)
      missing.push('missing_environment');
    // When nonInteractive and exactly two positionals (name, preview), treat as "all Preview branches"; otherwise require branch
    if (
      envTargetArg === 'preview' &&
      envGitBranch === undefined &&
      !(client.nonInteractive && args.length === 2)
    ) {
      missing.push('git_branch_required');
    }
    if (missing.length > 0) {
      const parts = missing.map(m => {
        if (m === 'missing_name') return 'variable name';
        if (m === 'missing_value') return '--value or stdin';
        if (m === 'missing_environment')
          return 'environment (production, preview, development, or a comma-separated list)';
        if (m === 'git_branch_required')
          return '`--git-branch <git-branch>` for Preview, or omit for all Preview branches';
        return m;
      });
      const fullTemplate = `env add <name> ${getEnvTargetPlaceholder()} --value "<value>" --yes`;
      const filledTemplate = fillEnvAddTemplate(fullTemplate, {
        envName,
        envTargetArg,
        envGitBranch,
      });
      const next: Array<{ command: string; when?: string }> = [];
      // Only suggest the full template when something other than git_branch is missing (that command would fail again if only git_branch is missing)
      const onlyGitBranchMissing =
        missing.length === 1 && missing[0] === 'git_branch_required';
      if (!onlyGitBranchMissing) {
        next.push({
          command: buildEnvAddCommandWithPreservedArgs(
            client.argv,
            filledTemplate
          ),
        });
      }
      if (
        missing.includes('git_branch_required') &&
        envName &&
        (valueFromFlag !== undefined || stdInput)
      ) {
        const branchSpecific = fillEnvAddTemplate(
          'env add <name> preview --git-branch <git-branch> --value "<value>" --yes',
          { envName, envTargetArg: 'preview' }
        );
        const branchAll = fillEnvAddTemplate(
          'env add <name> preview --value "<value>" --yes',
          { envName, envTargetArg: 'preview' }
        );
        next.push(
          {
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              branchSpecific
            ),
            when: 'Add to a specific Git branch',
          },
          {
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              branchAll
            ),
            when: 'Add to all Preview branches',
          }
        );
      }
      if (missing.includes('missing_environment')) {
        const standardAvailable = choices
          .map(c => c.value)
          .filter(v => isValidEnvTarget(v));
        const multiTargets = filterSensitiveMultiTargetSuggestionTargets(
          standardAvailable,
          {
            forceSensitive: Boolean(opts['--sensitive']),
            policyOn: false,
          }
        );
        if (multiTargets.length > 1) {
          next.push(
            multiTargetSuggestion(
              client.argv,
              envName || '<name>',
              multiTargets,
              multiTargets.includes('development') && !opts['--no-sensitive']
            )
          );
        }
      }
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_requirements',
          missing,
          message: `Provide all required inputs for non-interactive mode: ${parts.join('; ')}. Example: \`${filledTemplate}\``,
          next,
        },
        1
      );
    }
  }

  if (!envName) {
    envName = await client.input.text({
      message: `Name?`,
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

  if (!resolvedLink) {
    const link = await resolveProjectContext({
      client,
      projectNameOrId: opts['--project'],
    });
    if (link.status === 'error') {
      return link.exitCode;
    } else if (link.status === 'not_linked') {
      if (client.nonInteractive) {
        const preserved = getPreservedArgsForEnvAdd(client.argv);
        const linkPreserved = preserved.filter((a, i) => {
          if (a === '--value') return false;
          if (a.startsWith('--value=')) return false;
          if (i > 0 && preserved[i - 1] === '--value') return false;
          return true;
        });
        const linkArgv = [
          ...client.argv.slice(0, 2),
          'link',
          '--scope',
          '<scope>',
          ...linkPreserved,
        ];
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'not_linked',
            message: `Your codebase isn't linked to a project on Vercel. Run ${getCommandNamePlain(
              'link'
            )} to begin. Use --yes for non-interactive; use --scope or --project to specify team or project. Then run your env add command.`,
            next: [
              { command: buildCommandWithYes(linkArgv) },
              { command: buildCommandWithYes(redactEnvValueArgs(client.argv)) },
            ],
          },
          1
        );
      } else {
        output.error(
          `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
            'link'
          )} to begin.`
        );
      }
      return 1;
    }
    resolvedLink = link;
  }
  const link = resolvedLink;
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  const { project } = link;

  if (explicitType === 'secret' || forceSensitive) {
    const publicPrefixError = getPublicPrefixSecretVisibilityError(envName, {
      visibility: explicitType === 'secret' ? 'secret' : undefined,
      type: 'sensitive',
      context: 'add',
    });
    if (publicPrefixError) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_type',
            message: publicPrefixError,
          },
          1
        );
      }
      output.fatal(publicPrefixError);
      return 1;
    }
  }

  // Validate key name early (before value entry) with re-entry option.
  let keyAccepted = false;
  while (!keyAccepted) {
    const apiPublicPrefix = getApiPublicPrefix(envName);
    const frameworkPublicPrefix = getFrameworkPublicPrefix(
      project.framework,
      envName
    );
    const globallyKnownPrefix = getPublicPrefix(envName);
    const deferFrameworkSecretError =
      frameworkPublicPrefix !== null &&
      (explicitType === 'secret' || forceSensitive);
    const keyWarnings =
      deferFrameworkSecretError ||
      (globallyKnownPrefix !== null &&
        apiPublicPrefix === null &&
        frameworkPublicPrefix === null)
        ? []
        : getEnvKeyWarnings(envName);
    const sensitiveWarning = keyWarnings.find(w => w.requiresConfirmation);

    if (!sensitiveWarning) {
      for (const warning of keyWarnings) {
        printEnvAddWarning(warning.message);
      }
      keyAccepted = true;
      break;
    }

    const nameWithoutPrefix = removePublicPrefix(envName);
    const publicPrefix = getPublicPrefix(envName);

    if (typeSource === 'argv') {
      for (const warning of keyWarnings) {
        printEnvAddWarning(warning.message);
      }
      keyAccepted = true;
      break;
    }

    const privateCommand = buildEnvAddCommandWithPreservedArgs(
      client.argv,
      `env add ${nameWithoutPrefix} ${
        envTargetArg ?? getEnvTargetPlaceholder()
      } --type secret --value "<value>" --yes`
    );
    const publicCommand = buildEnvAddCommandWithPreservedArgs(
      client.argv,
      `env add ${envName} ${
        envTargetArg ?? getEnvTargetPlaceholder()
      } --type config --value "<value>" --yes`
    );
    const humanTargetArg = envTargetArg ? ` ${envTargetArg}` : '';
    const privateHumanCommand = buildHumanEnvAddCommand(
      client.argv,
      `env add ${nameWithoutPrefix}${humanTargetArg} --type secret`
    );
    const publicHumanCommand = buildHumanEnvAddCommand(
      client.argv,
      `env add ${envName}${humanTargetArg} --type config`
    );
    const message = `\`${envName}\` looks like a credential, and \`${publicPrefix}\` exposes its value to anyone visiting your site. Choose explicitly: rename to \`${nameWithoutPrefix}\` with \`--type secret\` to keep it private, or keep the name with \`--type config\` to expose it.`;

    if (client.nonInteractive || opts['--yes'] || !!stdInput) {
      if (client.nonInteractive) {
        outputActionRequired(client, {
          status: 'action_required',
          reason: 'public_prefix_requires_type',
          message,
          choices: [
            {
              id: 'private',
              name: `Keep private: rename to ${nameWithoutPrefix} and use Secret`,
            },
            {
              id: 'public',
              name: `Expose publicly: keep ${envName} as Config`,
            },
          ],
          next: [
            {
              command: privateCommand,
              when: 'Keep it private; replace <value> before running',
            },
            {
              command: publicCommand,
              when: 'Expose it publicly; replace <value> before running',
            },
          ],
        });
      }
      output.fatal(message);
      output.print(`  Keep it private:\n    ${privateHumanCommand}\n`);
      output.print(`  Expose it publicly:\n    ${publicHumanCommand}\n`);
      return 1;
    }

    for (const warning of keyWarnings) {
      printEnvAddWarning(warning.message);
    }

    const action = await client.input.select({
      message: 'How should this variable be stored?',
      choices: [
        {
          name: `Keep private: rename to ${nameWithoutPrefix} and use Secret`,
          value: 'p',
        },
        {
          name: `Expose to anyone visiting your site: keep ${envName} as Config`,
          value: 'c',
        },
        { name: 'Enter a different name', value: 'r' },
      ],
    });

    if (action === 'p') {
      envName = nameWithoutPrefix;
      explicitType = 'secret';
      typeSource = 'prompt';
      output.log(`Renamed to ${envName}`);
    } else if (action === 'c') {
      explicitType = 'config';
      typeSource = 'prompt';
      keyAccepted = true;
    } else {
      envName = await client.input.text({
        message: `Name?`,
        validate: val => (val ? true : 'Name cannot be empty'),
      });
    }
  }

  let customSveltePublicPrefix: string | undefined;
  const apiPublicPrefix = getApiPublicPrefix(envName);
  const matchingFrameworkPublicPrefix = getFrameworkPublicPrefix(
    project.framework,
    envName
  );
  if (
    matchingFrameworkPublicPrefix !== null &&
    (explicitType === 'secret' || forceSensitive)
  ) {
    const message = `\`${matchingFrameworkPublicPrefix}\` exposes this value to anyone visiting your site, so \`${envName}\` cannot be kept private as a Secret. Rename the variable without the framework's public prefix to keep it private, or use \`--type config\` only if the value is safe to expose.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        { status: 'error', reason: 'invalid_type', message },
        1
      );
    }
    output.fatal(message);
    return 1;
  }
  if (
    project.framework === 'sveltekit' ||
    project.framework === 'sveltekit-1' ||
    project.framework === 'sveltekit-2'
  ) {
    const localPublicPrefixes = await getLocalSvelteKitPublicPrefixes(
      link.repoRoot ?? client.cwd,
      (project as { rootDirectory?: string | null }).rootDirectory
    );
    const matchingLocalPrefix = localPublicPrefixes?.find(prefix =>
      envName.startsWith(prefix)
    );
    if (
      matchingLocalPrefix !== undefined &&
      apiPublicPrefix === null &&
      matchingFrameworkPublicPrefix === null
    ) {
      customSveltePublicPrefix = matchingLocalPrefix;
    }
  }
  if (
    customSveltePublicPrefix !== undefined &&
    (explicitType === 'secret' || forceSensitive)
  ) {
    const message =
      customSveltePublicPrefix === ''
        ? 'This SvelteKit project uses an empty `publicPrefix`, so every Environment Variable is exposed to the browser and cannot be kept private as a Secret. Change the SvelteKit `publicPrefix`, or use `--type config` only if the value is safe to expose.'
        : `\`${customSveltePublicPrefix}\` exposes this value to anyone visiting your site, so \`${envName}\` cannot be kept private as a Secret. Rename the variable without the configured public prefix, or use \`--type config\` only if the value is safe to expose.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        { status: 'error', reason: 'invalid_type', message },
        1
      );
    }
    output.fatal(message);
    return 1;
  }
  if (customSveltePublicPrefix !== undefined) {
    printEnvAddWarning(
      customSveltePublicPrefix === ''
        ? 'This SvelteKit project uses an empty `publicPrefix`, so every Environment Variable is exposed to the browser.'
        : `\`${customSveltePublicPrefix}\` variables are exposed to the browser by this SvelteKit project.`
    );
  }
  const skipConfirm =
    opts['--yes'] || !!stdInput || valueFromFlag !== undefined;
  const [{ envs }, customEnvironments] = await Promise.all([
    getEnvRecords(client, project.id, 'vercel-cli:env:add'),
    getCustomEnvironments(client, project.id),
  ]);

  if (envTargets.length > 0) {
    const resolved: string[] = [];
    const invalid: string[] = [];
    for (const target of envTargets) {
      if (isValidEnvTarget(target)) {
        resolved.push(target);
        continue;
      }
      const custom = customEnvironments.find(
        c => c.id === target || c.slug === target
      );
      if (custom) {
        resolved.push(custom.id);
      } else {
        invalid.push(target);
      }
    }
    if (invalid.length > 0) {
      const valid = [
        ...envTargetChoices.map(c => c.value),
        ...customEnvironments.map(c => c.slug),
      ];
      const message = `Invalid environment: ${invalid.join(
        ', '
      )}. Valid environments: ${valid.join(
        ', '
      )}. Separate multiple environments with commas.`;
      if (client.nonInteractive) {
        outputAgentError(
          client,
          { status: 'error', reason: 'invalid_environment', message },
          1
        );
      }
      output.error(message);
      return 1;
    }
    envTargets = resolved;
  }

  if (envGitBranch && envTargets.length > 1) {
    const message =
      'A Git branch can only be set when Preview is the only selected environment.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        { status: 'error', reason: 'branch_requires_preview_only', message },
        1
      );
    }
    output.error(message);
    return 1;
  }

  const matchingEnvs = envs.filter(r => r.key === envName);
  const existingTargets = new Set<string>();
  const existingCustomEnvs = new Set<string>();
  for (const env of matchingEnvs) {
    if (typeof env.target === 'string') {
      existingTargets.add(env.target);
    } else if (Array.isArray(env.target)) {
      for (const target of env.target) {
        existingTargets.add(target);
      }
    }
    if (env.customEnvironmentIds) {
      for (const customEnvId of env.customEnvironmentIds) {
        existingCustomEnvs.add(customEnvId);
      }
    }
  }
  const choices: EnvChoice[] = [
    ...envTargetChoices
      .filter(c => !existingTargets.has(c.value))
      .map(c => ({ name: c.name, value: c.value })),
    ...customEnvironments
      .filter(c => !existingCustomEnvs.has(c.id))
      .map(c => ({ name: c.slug, value: c.id })),
  ];

  if (!envGitBranch && choices.length === 0 && !opts['--force']) {
    const projectFlag = opts['--project']
      ? ` --project ${opts['--project']}`
      : '';
    output.error(
      `The variable ${param(
        envName
      )} has already been added to all Environments. To remove, run ${getCommandName(
        `env rm ${envName}${projectFlag}`
      )}.`
    );
    return 1;
  }

  // Detect team-level sensitive env var policy. Reads from the team object
  // (cached). Only relevant when the linked org is a team. The CLI no longer
  // enforces the legacy Sensitive Environment Variables Policy; it is used
  // only to omit inferred visibility for public-prefixed keys.
  const policyOn = false;
  let teamSensitivePolicyOn = false;
  let disjunctiveProductionSecretPolicyOn = false;
  if (link.org.type === 'team') {
    try {
      const team = await getTeamByIdOrSlug(client, link.org.id);
      teamSensitivePolicyOn = team?.sensitiveEnvironmentVariablePolicy === 'on';
      disjunctiveProductionSecretPolicyOn =
        team?.disjunctiveProductionSecretPolicy === 'on';
    } catch {
      // Non-fatal — policy detection is best-effort.
    }
  }

  const userWasExplicit = forceSensitive || forceEncrypted || !!explicitType;
  const skipSensitivePrompt =
    userWasExplicit || client.nonInteractive || skipConfirm;
  const isDevelopmentOnlyTarget =
    envTargets.length === 1 && envTargets[0] === 'development';

  let isSensitive: boolean;
  if (forceSensitive) {
    isSensitive = true;
  } else if (forceEncrypted) {
    isSensitive = false;
  } else if (explicitType) {
    isSensitive = explicitType === 'secret';
  } else if (
    apiPublicPrefix ||
    matchingFrameworkPublicPrefix ||
    customSveltePublicPrefix !== undefined
  ) {
    isSensitive = false;
    explicitType = 'config';
    typeSource = 'inferred';
  } else if (isDevelopmentOnlyTarget) {
    // Preserve the legacy default for ambiguous Development-only adds. Users
    // can still opt into a Development Secret explicitly with --type secret.
    isSensitive = false;
    typeSource = 'inferred';
  } else if (skipSensitivePrompt) {
    isSensitive = true;
    typeSource = 'default';
  } else {
    const selectedType = await client.input.select({
      message: 'Environment Variable type?',
      choices: [
        {
          name: getSecretStorageChoice(
            envTargets,
            looksLikeCredentialName(envName)
              ? 'because this name looks like a credential'
              : undefined
          ),
          value: 'secret',
        },
        { name: 'Config (can be revealed after saving)', value: 'config' },
      ],
    });
    isSensitive = selectedType === 'secret';
    explicitType = selectedType;
    typeSource = 'prompt';
  }

  if (envTargets.length > 0) {
    const compatibilityError = getTargetCompatibilityError(
      envTargets,
      isSensitive,
      policyOn
    );
    if (compatibilityError) {
      if (client.nonInteractive) {
        const next: Array<{ command: string; when?: string }> = [
          {
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              `env add ${envName} development --value "<value>" --yes`
            ),
            when: 'Add as non-sensitive to Development only',
          },
        ];
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'non_sensitive_not_allowed_on_production_preview',
            message: compatibilityError,
            next,
          },
          1
        );
      }
      output.error(compatibilityError);
      return 1;
    }
  }

  const envChoices = filterEnvChoicesForSensitivity(choices, {
    isSensitive,
    policyOn,
  });

  if (policyOn && isSensitive) {
    for (const choice of envChoices) {
      if (choice.value === 'production' || choice.value === 'preview') {
        choice.checked = true;
      }
    }
  } else if (envChoices.length === 1) {
    envChoices[0].checked = true;
  }

  if (
    !envGitBranch &&
    envChoices.length === 0 &&
    envTargets.length === 0 &&
    !opts['--force']
  ) {
    output.error(
      `No Environments are available for this variable with the selected sensitivity. Your team requires sensitive Environment Variables for Production and Preview.`
    );
    return 1;
  }

  let envValue: string;

  if (stdInput) {
    const normalizedStdinValue = normalizeStdinEnvValue(stdInput);
    envValue = normalizedStdinValue.value;
    if (normalizedStdinValue.strippedTrailingNewline) {
      output.log('Removed trailing newline from stdin input');
    }
  } else if (valueFromFlag !== undefined) {
    envValue = valueFromFlag;
  } else {
    if (client.nonInteractive) {
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_value',
        message:
          'In non-interactive mode provide the value via --value or stdin. Example: vercel env add <name> <environment> --value "<value>" --yes',
        next: [
          {
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              `env add <name> ${getEnvTargetPlaceholder()} --value "<value>" --yes`
            ),
          },
        ],
      });
    }
    envValue = await promptEnvValue(client, { isSensitive });
  }

  let { finalValue } = await validateEnvValue({
    envName,
    initialValue: envValue,
    skipConfirm,
    promptForValue: () => promptEnvValue(client, { isSensitive }),
    selectAction: choices =>
      client.input.select({ message: 'Value?', choices }),
    showWarning: msg => printEnvAddWarning(msg),
    showLog: msg => output.log(msg),
  });

  while (envTargets.length === 0) {
    if (client.nonInteractive && envChoices.length > 0) {
      const standardAvailable = choices
        .map(c => c.value)
        .filter(v => isValidEnvTarget(v));
      const multiTargets = filterSensitiveMultiTargetSuggestionTargets(
        standardAvailable,
        {
          forceSensitive,
          policyOn,
        }
      );
      const next: Array<{ command: string; when?: string }> = [];
      if (multiTargets.length > 1) {
        next.push(
          multiTargetSuggestion(
            client.argv,
            envName,
            multiTargets,
            multiTargets.includes('development') && !forceEncrypted
          )
        );
      }
      next.push(
        ...envChoices.slice(0, 5).map(c => ({
          command: buildEnvAddCommandWithPreservedArgs(
            client.argv,
            `env add ${envName} ${c.value} --value "<value>" --yes`
          ),
        }))
      );
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_environment',
        message: `Specify one or more environments (comma-separated). Add as argument or use: ${buildEnvAddCommandWithPreservedArgs(
          client.argv,
          `env add ${envName} <environment>[,<environment>] --value "<value>" --yes`
        )}`,
        choices: envChoices.map(c => ({
          id: c.value,
          name: typeof c.name === 'string' ? c.name : c.value,
        })),
        next,
      });
    }
    envTargets = await client.input.checkbox({
      message: `Environments?`,
      instructions: CHECKBOX_INSTRUCTIONS,
      choices: envChoices,
    });

    if (envTargets.length === 0) {
      output.error('Please select at least one Environment');
    }
  }

  const postSelectionError = getTargetCompatibilityError(
    envTargets,
    isSensitive,
    policyOn
  );
  if (postSelectionError) {
    output.error(postSelectionError);
    return 1;
  }

  // Skip the Git branch prompt when `--yes` is set (all Preview branches) or
  // when non-interactive with only name+preview positionals.
  if (
    envGitBranch === undefined &&
    envTargets.length === 1 &&
    envTargets[0] === 'preview' &&
    !opts['--yes'] &&
    !(client.nonInteractive && args.length === 2)
  ) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'git_branch_required',
          message: `Add ${envName} to which Git branch for Preview? Pass branch as third argument, or omit for all Preview branches.`,
          next: [
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} preview --git-branch <git-branch> --value "<value>" --yes`
              ),
              when: 'Add to a specific Git branch',
            },
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} preview --value "<value>" --yes`
              ),
              when: 'Add to all Preview branches',
            },
          ],
        },
        1
      );
    } else {
      output.print(
        `  ${chalk.dim('Leave empty to apply to all Preview branches.')}\n`
      );
      envGitBranch = await client.input.text({
        message: `Git branch?`,
      });
    }
  }

  const hasDevelopment = envTargets.includes('development');

  let finalType = resolveFinalType(envTargets, isSensitive, {
    forceSensitive,
    forceEncrypted,
    policyOn,
  });

  if (policyOn && !hasDevelopment) {
    if (forceEncrypted) {
      // User asked for encrypted on Production/Preview, but the team policy
      // will promote it to sensitive server-side regardless. Surface that so
      // the user isn't surprised later.
      printEnvAddWarning(
        `--no-sensitive is ignored: your team enforces sensitive Environment Variables for Production and Preview.`
      );
      finalType = 'sensitive';
    }
  }

  while (
    finalType === 'encrypted' &&
    (looksLikeCredentialName(envName, customSveltePublicPrefix) ||
      looksLikeSecretValue(finalValue))
  ) {
    printEnvAddWarning(
      'This name or value looks like a credential. Config values can be revealed after saving.'
    );
    const publicPrefix =
      getApiPublicPrefix(envName) ??
      getFrameworkPublicPrefix(project.framework, envName) ??
      customSveltePublicPrefix;
    if (publicPrefix !== undefined && typeSource === 'inferred') {
      const privateName = envName.slice(publicPrefix.length);
      const privateCommand = buildEnvAddCommandWithPreservedArgs(
        client.argv,
        `env add ${privateName} ${envTargets.join(
          ','
        )} --type secret --value "<value>" --yes`
      );
      const publicCommand = buildEnvAddCommandWithPreservedArgs(
        client.argv,
        `env add ${envName} ${envTargets.join(
          ','
        )} --type config --value "<value>" --yes`
      );
      const privateHumanCommand = buildHumanEnvAddCommand(
        client.argv,
        `env add ${privateName} ${envTargets.join(',')} --type secret`
      );
      const publicHumanCommand = buildHumanEnvAddCommand(
        client.argv,
        `env add ${envName} ${envTargets.join(',')} --type config`
      );
      const message =
        publicPrefix === ''
          ? `\`${envName}\` looks like a credential, and this SvelteKit project exposes every Environment Variable to the browser. Change the SvelteKit \`publicPrefix\` to keep it private, or use \`--type config\` only if the value is safe to expose.`
          : `\`${envName}\` looks like a credential, and \`${publicPrefix}\` exposes its value to anyone visiting your site. Choose explicitly: rename to \`${privateName}\` with \`--type secret\` to keep it private, or keep the name with \`--type config\` to expose it.`;
      if (client.nonInteractive) {
        outputActionRequired(client, {
          status: 'action_required',
          reason: 'public_prefix_requires_type',
          message,
          next: [
            ...(publicPrefix === ''
              ? []
              : [
                  {
                    command: privateCommand,
                    when: 'Keep it private; replace <value> before running',
                  },
                ]),
            {
              command: publicCommand,
              when: 'Expose it publicly; replace <value> before running',
            },
          ],
        });
      }
      if (opts['--yes']) {
        output.fatal(message);
        if (publicPrefix !== '') {
          output.print(`  Keep it private:\n    ${privateHumanCommand}\n`);
        }
        output.print(`  Expose it publicly:\n    ${publicHumanCommand}\n`);
        return 1;
      }
      const selectedAction = await client.input.select({
        message: 'How should this variable be stored?',
        choices: [
          ...(publicPrefix === ''
            ? []
            : [
                {
                  name: `Keep private: rename to ${privateName} and use Secret`,
                  value: 'private',
                },
              ]),
          {
            name: `Expose to anyone visiting your site: keep ${envName} as Config`,
            value: 'public',
          },
          { name: 'Enter a different value', value: 'reenter' },
        ],
      });
      if (selectedAction === 'private') {
        envName = privateName;
        finalType = 'sensitive';
        explicitType = 'secret';
        typeSource = 'prompt';
        output.log(`Renamed to ${envName}`);
        break;
      }
      if (selectedAction === 'reenter') {
        const reenteredValue = await promptEnvValue(client, {
          isSensitive: false,
        });
        const validated = await validateEnvValue({
          envName,
          initialValue: reenteredValue,
          skipConfirm: false,
          promptForValue: () => promptEnvValue(client, { isSensitive: false }),
          selectAction: choices =>
            client.input.select({ message: 'Value?', choices }),
          showWarning: msg => printEnvAddWarning(msg),
          showLog: msg => output.log(msg),
        });
        finalValue = validated.finalValue;
        continue;
      }
    } else if (
      typeSource !== 'argv' &&
      typeSource !== 'prompt' &&
      !opts['--yes'] &&
      !client.nonInteractive
    ) {
      const selectedType = await client.input.select({
        message: 'Store this value as?',
        choices: [
          {
            name: getSecretStorageChoice(envTargets, 'for this value'),
            value: 'secret',
          },
          {
            name: 'Config (can be revealed after saving)',
            value: 'config',
          },
        ],
      });
      if (selectedType === 'secret') {
        finalType = 'sensitive';
        explicitType = 'secret';
        typeSource = 'prompt';
      }
    }
    break;
  }

  if (
    finalType === 'sensitive' &&
    customSveltePublicPrefix !== undefined &&
    envName.startsWith(customSveltePublicPrefix)
  ) {
    printEnvAddWarning(
      'This SvelteKit project exposes this variable to the browser; the Secret type does not prevent that. Rename the variable without the configured public prefix to keep it private.'
    );
  }

  if (
    isFlagsSecretNeedingSplit({
      key: envName,
      type: finalType,
      targets: envTargets.filter(isValidEnvTarget),
      customEnvironmentIds: envTargets.filter(
        target => !isValidEnvTarget(target)
      ),
    })
  ) {
    printEnvAddWarning(
      'FLAGS_SECRET should use a separate value for each environment so Development overrides cannot affect Preview or Production.'
    );
  }

  const hasProduction = envTargets.includes('production');
  const hasNonProduction = envTargets.some(target => target !== 'production');
  if (
    finalType === 'sensitive' &&
    disjunctiveProductionSecretPolicyOn &&
    hasProduction &&
    hasNonProduction
  ) {
    const message =
      'Your team requires Production and non-Production Secrets to be stored separately with different values. Run one command for Production and another for the remaining environments.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'production_secret_must_be_separate',
          message,
          next: [
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} production --type secret --value "<production-value>" --yes`
              ),
              when: 'Set the Production Secret',
            },
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} ${envTargets
                  .filter(target => target !== 'production')
                  .join(
                    ','
                  )} --type secret --value "<non-production-value>" --yes`
              ),
              when: 'Set the non-Production Secret',
            },
          ],
        },
        1
      );
    }
    output.fatal(message);
    return 1;
  }

  const upsert = opts['--force'] ? 'true' : '';
  const { visibility, error: visibilityError } = resolveEnvVarVisibility({
    explicitVisibility: explicitType,
    explicitOptionSource: typeOption.source,
    type: finalType,
    key: envName,
    envTargets,
    teamSensitivePolicyOn,
    context: 'add',
  });
  if (visibilityError) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_type',
          message: visibilityError,
        },
        1
      );
    }
    output.fatal(visibilityError);
    return 1;
  }

  try {
    output.spinner('Saving…');
    await addEnvRecord(
      client,
      project.id,
      upsert,
      finalType,
      envName,
      finalValue,
      envTargets,
      envGitBranch,
      visibility
    );
  } catch (err: unknown) {
    if (client.nonInteractive && isAPIError(err)) {
      const productionSecretPolicyError = getProductionSecretPolicyErrorKind(
        err.serverMessage
      );
      const reason = productionSecretPolicyError
        ? productionSecretPolicyError === 'different-values'
          ? 'production_secret_requires_different_value'
          : 'production_secret_must_be_separate'
        : (err as { slug?: string }).slug ||
          (err.serverMessage?.toLowerCase().includes('branch')
            ? 'branch_not_found'
            : 'api_error');
      outputAgentError(
        client,
        {
          status: 'error',
          reason,
          message: productionSecretPolicyError
            ? `${err.serverMessage} ${getProductionSecretPolicyRecovery(
                productionSecretPolicyError
              )}`
            : err.serverMessage,
        },
        1
      );
    }
    if (isAPIError(err) && isKnownError(err)) {
      output.error(err.serverMessage);
      return 1;
    }
    throw err;
  }

  printEnvAddResult(
    link,
    envName,
    envTargets,
    envGitBranch,
    customEnvironments,
    finalType,
    Boolean(opts['--force']),
    visibility
  );

  if (typeSource === 'default') {
    output.print(
      `  ${chalk.dim(getDefaultSecretStorageGuidance(envTargets))}\n`
    );
  }

  const { isAgent } = await determineAgent();
  const guidanceMode = isGuidanceEnabled(
    client,
    parsedArgs.flags['--guidance'],
    isAgent
  );

  if (guidanceMode) {
    suggestNextCommands([
      {
        description: 'List Environment Variables',
        command: withGlobalFlags(client, 'env ls', { preserveProject: true }),
      },
      {
        description: 'Pull Development Environment Variables into .env.local',
        command: withGlobalFlags(client, 'env pull', {
          preserveProject: true,
        }),
      },
    ]);
  }

  return 0;
}

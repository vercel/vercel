import chalk from 'chalk';
import type Client from '../../util/client';
import updateEnvRecord from '../../util/env/update-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import param from '../../util/output/param';
import { isKnownError } from '../../util/env/known-error';
import {
  getLocalSvelteKitPublicPrefixes,
  getApiPublicPrefix,
  getFrameworkPublicPrefix,
  getPublicPrefix,
  normalizeStdinEnvValue,
  validateEnvValue,
} from '../../util/env/validate-env';
import formatEnvironments from '../../util/env/format-environments';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import output from '../../output-manager';
import { EnvUpdateTelemetryClient } from '../../util/telemetry/commands/env/update';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { updateSubcommand } from './command';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { quoteArg } from '../../util/flags/quote-arg';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  ENV_VISIBILITY_DEPRECATION_MESSAGE,
  getPublicPrefixSecretVisibilityError,
  isSecretEnvVar,
  resolveEnvVarTypeOption,
  resolveEnvVarVisibility,
  formatVisibilityLabel,
} from '../../util/env/env-var-config-secret-ui';
import {
  looksLikeSecret,
  looksLikeSecretValue,
} from '../../util/env/secret-detection';
import {
  getProductionSecretPolicyErrorKind,
  getProductionSecretPolicyRecovery,
  getSecretStorageChoice,
} from '../../util/env/secret-storage-guidance';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvUpdateCommandWithPreservedArgs,
  getPreservedArgsForEnvUpdate,
  redactEnvValueArgs,
} from '../../util/agent-output';

function looksLikeCredentialName(
  key: string,
  publicPrefix: string | null | undefined = getPublicPrefix(key)
): boolean {
  return looksLikeSecret(publicPrefix ? key.slice(publicPrefix.length) : key);
}

function printEnvUpdateWarning(message: string): void {
  output.print(`${chalk.yellow('!')} ${message}\n`);
}

function omitEnvValueArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--value') {
      i++;
      continue;
    }
    if (argv[i].startsWith('--value=')) continue;
    out.push(argv[i]);
  }
  return out;
}

function formatTargetArg(
  targets: string[],
  customEnvironments: CustomEnvironment[]
): string {
  return targets
    .map(
      target =>
        customEnvironments.find(
          environment =>
            environment.id === target || environment.slug === target
        )?.slug ?? target
    )
    .join(',');
}

function promptEnvUpdateValue(
  client: Client,
  envName: string,
  isSecret: boolean
): Promise<string> {
  return client.input.text({
    message: `What's the new value of ${envName}?`,
    ...(isSecret
      ? { transformer: (value: string) => '*'.repeat(value.length) }
      : {}),
  });
}

export default async function update(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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

  const valueFromFlag =
    typeof opts['--value'] === 'string' ? opts['--value'] : undefined;
  const stdInput = await readStandardInput(client.stdin);
  let [envName, envTargetArg, envGitBranch] = args;
  const typeOption = resolveEnvVarTypeOption({
    type: typeof opts['--type'] === 'string' ? opts['--type'] : undefined,
    visibility:
      typeof opts['--visibility'] === 'string'
        ? opts['--visibility']
        : undefined,
  });
  let explicitType = typeOption.explicitVisibility;
  const typeWasExplicit =
    explicitType !== undefined || Boolean(opts['--sensitive']);

  const telemetryClient = new EnvUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagYes(opts['--yes']);
  telemetryClient.trackCliOptionValue(
    valueFromFlag === undefined ? undefined : '<redacted>'
  );
  telemetryClient.trackCliOptionType(
    typeof opts['--type'] === 'string' ? opts['--type'] : undefined
  );
  telemetryClient.trackCliOptionVisibility(
    typeof opts['--visibility'] === 'string' ? opts['--visibility'] : undefined
  );

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
    printEnvUpdateWarning(ENV_VISIBILITY_DEPRECATION_MESSAGE);
  }

  if (explicitType === 'config' && opts['--sensitive']) {
    const message =
      '`--type config` cannot be used with `--sensitive`. Pick one.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'conflicting_type_flags',
          message,
        },
        1
      );
    }
    output.fatal(message);
    return 1;
  }

  if (args.length > 3) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: `Invalid number of arguments. Usage: \`${getCommandNamePlain(
            `env update <name> ${getEnvTargetPlaceholder()} <gitbranch>`
          )}\``,
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env update <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env update <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  // Non-interactive: report all missing requirements in one shot (like env add)
  if (client.nonInteractive) {
    const missing: string[] = [];
    if (!envName) missing.push('missing_name');
    if (!stdInput && valueFromFlag === undefined) missing.push('missing_value');
    if (missing.length > 0) {
      const parts = missing.map(m =>
        m === 'missing_name' ? 'name' : '--value or stdin'
      );
      // Production does not use branch; only preview/development use optional <gitbranch>
      const targetPart = envTargetArg || getEnvTargetPlaceholder();
      const branchPart =
        envTargetArg === 'preview' || envTargetArg === 'development'
          ? ' <gitbranch>'
          : '';
      const template = `env update ${envName || '<name>'} ${targetPart}${branchPart} --value <value> --yes`;
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_requirements',
          missing,
          message: `Provide all required inputs for non-interactive mode: ${parts.join('; ')}. Example: ${getCommandNamePlain(template)}`,
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                template
              ),
            },
          ],
        },
        1
      );
    }
  }

  const envTargets: string[] = [];
  if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  if (!envName) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_name',
          message:
            'Provide the variable name as an argument. Example: vercel env update <name>',
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                `env update <name> ${getEnvTargetPlaceholder()} --value <value> --yes`
              ),
            },
          ],
        },
        1
      );
    } else {
      envName = await client.input.text({
        message: `What's the name of the variable to update?`,
        validate: val => (val ? true : 'Name cannot be empty'),
      });
    }
  }

  telemetryClient.trackCliOptionProject(opts['--project']);

  const link = await resolveProjectContext({
    client,
    projectNameOrId: opts['--project'],
  });
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const preserved = omitEnvValueArgs(
        getPreservedArgsForEnvUpdate(client.argv)
      ).filter(a => a !== '--yes' && a !== '-y');
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        '--scope',
        '<scope>',
        ...preserved,
      ];
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run ${getCommandNamePlain(
            'link'
          )} to begin. Use --yes for non-interactive; use --scope or --project to specify team or project.`,
          next: [
            { command: buildCommandWithYes(linkArgv) },
            {
              command: buildCommandWithYes(redactEnvValueArgs(client.argv)),
            },
          ],
        },
        1
      );
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  const { project } = link;
  const [{ envs }, customEnvironments] = await Promise.all([
    getEnvRecords(client, project.id, 'vercel-cli:env:update'),
    getCustomEnvironments(client, project.id),
  ]);
  const customEnvironment = customEnvironments.find(
    ({ slug, id }) => slug === envTargetArg || id === envTargetArg
  );
  const normalizedEnvTargetArg = customEnvironment?.id || envTargetArg;

  const matchingEnvs = envs.filter(r => r.key === envName);

  if (matchingEnvs.length === 0) {
    const listFlags = getGlobalFlagsFromArgs(client.argv.slice(2), {
      preserveProject: true,
    });
    const listArgs = `env ls ${listFlags.join(' ')}`.trim();
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'env_not_found',
          message: `The variable ${envName} was not found. Run ${getCommandNamePlain(listArgs)} to see all available Environment Variables.`,
        },
        1
      );
    }
    output.error(
      `The variable ${param(envName)} was not found. Run ${getCommandName(listArgs)} to see all available Environment Variables.`
    );
    return 1;
  }

  let selectedEnv: ProjectEnvVariable;

  // If specific target and/or git branch is provided, filter matching envs
  if (envTargetArg || envGitBranch) {
    const filteredEnvs = matchingEnvs.filter(env => {
      const matchesTarget =
        !normalizedEnvTargetArg ||
        (Array.isArray(env.target)
          ? env.target.includes(normalizedEnvTargetArg as any)
          : env.target === normalizedEnvTargetArg) ||
        (env.customEnvironmentIds &&
          env.customEnvironmentIds.includes(normalizedEnvTargetArg));
      const matchesGitBranch = !envGitBranch || env.gitBranch === envGitBranch;
      return matchesTarget && matchesGitBranch;
    });

    if (filteredEnvs.length === 0) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'env_not_found',
            message: `No Environment Variable ${envName} found matching the specified target/branch.`,
          },
          1
        );
      }
      output.error(
        `No Environment Variable ${param(envName)} found matching the specified criteria.`
      );
      return 1;
    }

    if (filteredEnvs.length === 1) {
      selectedEnv = filteredEnvs[0];
    } else {
      if (client.nonInteractive) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'multiple_envs',
            message: `Multiple Environment Variables match ${envName}. Specify target and/or branch to update one.`,
            next: [
              {
                command: buildEnvUpdateCommandWithPreservedArgs(
                  client.argv,
                  `env update ${envName} ${getEnvTargetPlaceholder()} <gitbranch> --value "<value>" --yes`
                ),
              },
            ],
          },
          1
        );
      }
      // Multiple matches, let user choose
      const choices = filteredEnvs.map((env, index) => {
        const targets = formatEnvironments(link, env, customEnvironments);
        return {
          name: targets,
          value: index,
        };
      });

      const selectedIndex = await client.input.select({
        message: `Multiple Environment Variables found for ${param(envName)}. Which one do you want to update?`,
        choices,
      });

      selectedEnv = filteredEnvs[selectedIndex];
    }
  } else if (matchingEnvs.length === 1) {
    selectedEnv = matchingEnvs[0];
  } else {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'multiple_envs',
          message: `Multiple Environment Variables match ${envName}. Specify target and/or branch to update one.`,
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                `env update ${envName} ${getEnvTargetPlaceholder()} <gitbranch> --value "<value>" --yes`
              ),
            },
          ],
        },
        1
      );
    }
    // Multiple environments without specific target, let user choose
    const choices = matchingEnvs.map((env, index) => {
      const targets = formatEnvironments(link, env, customEnvironments);
      return {
        name: targets,
        value: index,
      };
    });

    const selectedIndex = await client.input.select({
      message: `Multiple Environment Variables found for ${param(envName)}. Which one do you want to update?`,
      choices,
    });

    selectedEnv = matchingEnvs[selectedIndex];
  }

  let customSveltePublicPrefix: string | undefined;
  const apiPublicPrefix = getApiPublicPrefix(envName);
  const frameworkPublicPrefix = getFrameworkPublicPrefix(
    project.framework,
    envName
  );
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
      frameworkPublicPrefix === null
    ) {
      customSveltePublicPrefix = matchingLocalPrefix;
    }
  }

  const targets = Array.isArray(selectedEnv.target)
    ? selectedEnv.target
    : [selectedEnv.target].filter((r): r is NonNullable<typeof r> =>
        Boolean(r)
      );
  const allTargets = [...targets, ...(selectedEnv.customEnvironmentIds || [])];
  const selectedEnvIsSecret = isSecretEnvVar(selectedEnv);

  if (explicitType === 'config' && selectedEnvIsSecret) {
    const removeTargetArg =
      envTargetArg || targets[0] || allTargets[0] || getEnvTargetPlaceholder();
    const addTargetArg =
      formatTargetArg(allTargets, customEnvironments) || removeTargetArg;
    const removeBranchArg = selectedEnv.gitBranch
      ? ` ${quoteArg(selectedEnv.gitBranch)}`
      : '';
    const addBranchArg = selectedEnv.gitBranch
      ? ` --git-branch ${quoteArg(selectedEnv.gitBranch)}`
      : '';
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2), {
      preserveProject: true,
    });
    const humanGlobalFlags = globalFlags.filter(
      flag => !flag.startsWith('--non-interactive')
    );
    const globalSuffix =
      globalFlags.length > 0 ? ` ${globalFlags.map(quoteArg).join(' ')}` : '';
    const humanGlobalSuffix =
      humanGlobalFlags.length > 0
        ? ` ${humanGlobalFlags.map(quoteArg).join(' ')}`
        : '';
    const removeCommand = getCommandNamePlain(
      `env rm ${envName} ${removeTargetArg}${removeBranchArg} --yes${globalSuffix}`
    );
    const addCommand = getCommandNamePlain(
      `env add ${envName} ${addTargetArg}${addBranchArg} --type config --value "<value>" --yes${globalSuffix}`
    );
    const removeHumanCommand = getCommandNamePlain(
      `env rm ${envName} ${removeTargetArg}${removeBranchArg}${humanGlobalSuffix}`
    );
    const addHumanCommand = getCommandNamePlain(
      `env add ${envName} ${addTargetArg}${addBranchArg} --type config${humanGlobalSuffix}`
    );
    const message =
      'A Secret cannot be changed to Config. To store this value as Config, remove the variable and add it again with `--type config`.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'secret_cannot_become_config',
          message,
          next: [
            {
              command: removeCommand,
              when: 'Remove the Secret from all of its environments',
            },
            {
              command: addCommand,
              when: 'Add it again as Config; replace <value> before running',
            },
          ],
        },
        1
      );
    }
    output.fatal(
      `A Secret cannot be changed to Config. Remove the variable, then add it again as Config. ${param(envName)} will be unavailable to new builds between these commands.`
    );
    output.print(`  Remove:\n    ${removeHumanCommand}\n`);
    output.print(
      `  Add as Config (prompts for the value):\n    ${addHumanCommand}\n`
    );
    return 1;
  }

  if (explicitType === 'secret' || opts['--sensitive']) {
    const knownPublicPrefix = apiPublicPrefix ?? frameworkPublicPrefix;
    const publicPrefix = knownPublicPrefix ?? customSveltePublicPrefix;
    const apiPublicPrefixError = apiPublicPrefix
      ? getPublicPrefixSecretVisibilityError(envName, {
          visibility: explicitType === 'secret' ? 'secret' : undefined,
          type: 'sensitive',
          context: 'update',
        })
      : null;
    const publicPrefixError = apiPublicPrefixError
      ? apiPublicPrefixError
      : knownPublicPrefix
        ? `\`${knownPublicPrefix}\` exposes this value to anyone visiting your site, so \`${envName}\` cannot be kept private as a Secret. Add a new Secret without the public prefix, then remove this Config.`
        : customSveltePublicPrefix === ''
          ? 'This SvelteKit project uses an empty `publicPrefix`, so every Environment Variable is exposed to the browser and cannot be kept private as a Secret. Change the SvelteKit `publicPrefix`, or keep this variable as Config only if the value is safe to expose.'
          : customSveltePublicPrefix !== undefined
            ? `\`${customSveltePublicPrefix}\` exposes this value to anyone visiting your site, so \`${envName}\` cannot be kept private as a Secret. Add a new Secret without the configured public prefix, then remove this Config.`
            : null;
    if (publicPrefixError) {
      const privateName =
        publicPrefix === undefined
          ? envName
          : envName.slice(publicPrefix.length);
      const removeTargetArg =
        envTargetArg ||
        targets[0] ||
        allTargets[0] ||
        getEnvTargetPlaceholder();
      const addTargetArg =
        formatTargetArg(allTargets, customEnvironments) || removeTargetArg;
      const removeBranchArg = selectedEnv.gitBranch
        ? ` ${quoteArg(selectedEnv.gitBranch)}`
        : '';
      const addBranchArg = selectedEnv.gitBranch
        ? ` --git-branch ${quoteArg(selectedEnv.gitBranch)}`
        : '';
      const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2), {
        preserveProject: true,
      });
      const humanGlobalFlags = globalFlags.filter(
        flag => !flag.startsWith('--non-interactive')
      );
      const globalSuffix =
        globalFlags.length > 0 ? ` ${globalFlags.map(quoteArg).join(' ')}` : '';
      const humanGlobalSuffix =
        humanGlobalFlags.length > 0
          ? ` ${humanGlobalFlags.map(quoteArg).join(' ')}`
          : '';
      const addCommand =
        publicPrefix === ''
          ? undefined
          : getCommandNamePlain(
              `env add ${privateName} ${addTargetArg}${addBranchArg} --type secret --value "<value>" --yes${globalSuffix}`
            );
      const removeCommand = getCommandNamePlain(
        `env rm ${envName} ${removeTargetArg}${removeBranchArg} --yes${globalSuffix}`
      );
      const addHumanCommand =
        publicPrefix === ''
          ? undefined
          : getCommandNamePlain(
              `env add ${privateName} ${addTargetArg}${addBranchArg} --type secret${humanGlobalSuffix}`
            );
      const removeHumanCommand = getCommandNamePlain(
        `env rm ${envName} ${removeTargetArg}${removeBranchArg}${humanGlobalSuffix}`
      );
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_type',
            message: publicPrefixError,
            next: addCommand
              ? [
                  {
                    command: addCommand,
                    when: 'Add the private Secret; replace <value> before running',
                  },
                  {
                    command: removeCommand,
                    when: 'Remove the public Config after the Secret is available',
                  },
                ]
              : [],
          },
          1
        );
      }
      output.fatal(publicPrefixError);
      if (addHumanCommand) {
        output.print(
          `  Add the private Secret (prompts for the value):\n    ${addHumanCommand}\n`
        );
        output.print(
          `  Remove the public Config:\n    ${removeHumanCommand}\n`
        );
      }
      return 1;
    }
  }

  if (customSveltePublicPrefix !== undefined) {
    printEnvUpdateWarning(
      customSveltePublicPrefix === ''
        ? 'This SvelteKit project uses an empty `publicPrefix`, so every Environment Variable is exposed to the browser.'
        : `\`${customSveltePublicPrefix}\` variables are exposed to the browser by this SvelteKit project.`
    );
  }

  // Detect team-level sensitive env var policy. Cached in getTeamByIdOrSlug.
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

  let envValue: string;
  const shouldMaskValue =
    Boolean(opts['--sensitive']) ||
    explicitType === 'secret' ||
    (explicitType === undefined && selectedEnvIsSecret);

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
      const branchPart =
        envTargetArg === 'preview' || envTargetArg === 'development'
          ? ' <gitbranch>'
          : '';
      const targetPart = envTargetArg || getEnvTargetPlaceholder();
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_value',
          message:
            'In non-interactive mode, provide the new value with `--value` or stdin. Example: `vercel env update <name> <environment> --value "<value>" --yes`',
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                `env update ${envName} ${targetPart}${branchPart} --value <value> --yes`
              ),
            },
          ],
        },
        1
      );
    }
    envValue = await promptEnvUpdateValue(client, envName, shouldMaskValue);
  }

  const skipConfirm =
    opts['--yes'] || !!stdInput || valueFromFlag !== undefined;
  const { finalValue } = await validateEnvValue({
    envName,
    initialValue: envValue,
    skipConfirm,
    promptForValue: () =>
      promptEnvUpdateValue(client, envName, shouldMaskValue),
    selectAction: choices =>
      client.input.select({ message: 'How to proceed?', choices }),
    showWarning: printEnvUpdateWarning,
    showLog: msg => output.log(msg),
  });

  let type =
    opts['--sensitive'] || explicitType === 'secret'
      ? 'sensitive'
      : explicitType === 'config'
        ? 'encrypted'
        : selectedEnv.type;
  const isFinalSecret = () =>
    type === 'sensitive' || (explicitType === undefined && selectedEnvIsSecret);

  if (
    !isFinalSecret() &&
    (type === 'plain' || type === 'encrypted') &&
    (looksLikeCredentialName(envName, customSveltePublicPrefix) ||
      looksLikeSecretValue(finalValue))
  ) {
    printEnvUpdateWarning(
      'This name or value looks like a credential. Config values can be revealed after saving.'
    );
    const publicPrefix =
      apiPublicPrefix ?? frameworkPublicPrefix ?? customSveltePublicPrefix;
    if (publicPrefix !== null && publicPrefix !== undefined) {
      printEnvUpdateWarning(
        publicPrefix === ''
          ? 'This SvelteKit project exposes every Environment Variable to the browser. Keep Config only if the value is safe to expose.'
          : `\`${publicPrefix}\` exposes this value to anyone visiting your site. Keep Config only if the value is safe to expose.`
      );
      if (!typeWasExplicit && (opts['--yes'] || client.nonInteractive)) {
        const message =
          publicPrefix === ''
            ? 'This SvelteKit project exposes every Environment Variable to the browser. To keep this value private, change the configured public prefix before storing it as Secret. If the value is safe to expose, rerun with `--type config`.'
            : `\`${publicPrefix}\` exposes \`${envName}\` to anyone visiting your site. To keep this value private, add \`${envName.slice(
                publicPrefix.length
              )}\` as Secret, then remove \`${envName}\`. If the value is safe to expose, rerun with \`--type config\`.`;
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'unsafe_public_config',
              message,
            },
            1
          );
        }
        output.fatal(message);
        return 1;
      }
      if (
        publicPrefix !== '' &&
        !typeWasExplicit &&
        !opts['--yes'] &&
        !client.nonInteractive
      ) {
        const privateName = envName.slice(publicPrefix.length);
        const removeTargetArg =
          envTargetArg ||
          targets[0] ||
          allTargets[0] ||
          getEnvTargetPlaceholder();
        const addTargetArg =
          formatTargetArg(allTargets, customEnvironments) || removeTargetArg;
        const removeBranchArg = selectedEnv.gitBranch
          ? ` ${quoteArg(selectedEnv.gitBranch)}`
          : '';
        const addBranchArg = selectedEnv.gitBranch
          ? ` --git-branch ${quoteArg(selectedEnv.gitBranch)}`
          : '';
        const humanGlobalFlags = getGlobalFlagsFromArgs(client.argv.slice(2), {
          preserveProject: true,
        }).filter(flag => !flag.startsWith('--non-interactive'));
        const humanGlobalSuffix =
          humanGlobalFlags.length > 0
            ? ` ${humanGlobalFlags.map(quoteArg).join(' ')}`
            : '';
        const addPrivateCommand = getCommandNamePlain(
          `env add ${privateName} ${addTargetArg}${addBranchArg} --type secret${humanGlobalSuffix}`
        );
        const removePublicCommand = getCommandNamePlain(
          `env rm ${envName} ${removeTargetArg}${removeBranchArg}${humanGlobalSuffix}`
        );
        const selectedAction = await client.input.select({
          message: 'How should this variable be stored?',
          choices: [
            {
              name: `Keep private: add ${privateName} as Secret, then remove ${envName}`,
              value: 'private',
            },
            {
              name: `Expose to anyone visiting your site: keep ${envName} as Config`,
              value: 'config',
            },
          ],
        });
        if (selectedAction === 'private') {
          output.print('  Add the private Secret (prompts for the value):\n');
          output.print(`    ${addPrivateCommand}\n`);
          output.print('  Remove the public Config:\n');
          output.print(`    ${removePublicCommand}\n`);
          return 1;
        }
      }
    } else if (!typeWasExplicit && !opts['--yes'] && !client.nonInteractive) {
      const selectedType = await client.input.select({
        message: 'Store this value as?',
        choices: [
          {
            name: getSecretStorageChoice(targets, 'for this value'),
            value: 'secret',
          },
          {
            name: 'Config (can be revealed after saving)',
            value: 'config',
          },
        ],
      });
      if (selectedType === 'secret') {
        type = 'sensitive';
        explicitType = 'secret';
      }
    } else if (!typeWasExplicit) {
      printEnvUpdateWarning('Re-run with `--type secret` to protect it.');
    }
  }

  if (isFinalSecret() && !selectedEnvIsSecret) {
    printEnvUpdateWarning(
      'The previous value was readable as Config and may have been exposed. If this variable still holds the same credential, rotate it at its provider and update this variable again.'
    );
  }

  const finalPublicPrefix =
    apiPublicPrefix ?? frameworkPublicPrefix ?? customSveltePublicPrefix;
  if (
    isFinalSecret() &&
    finalPublicPrefix !== null &&
    finalPublicPrefix !== undefined
  ) {
    printEnvUpdateWarning(
      finalPublicPrefix === ''
        ? 'This SvelteKit project exposes every Environment Variable to the browser; the Secret type does not prevent that. Change the configured public prefix to keep values private.'
        : `\`${finalPublicPrefix}\` exposes this variable to the browser; the Secret type does not prevent that. Rename the variable without the public prefix to keep it private.`
    );
  }

  if (
    isFinalSecret() &&
    disjunctiveProductionSecretPolicyOn &&
    targets.includes('production') &&
    allTargets.some(target => target !== 'production')
  ) {
    const message =
      'Your team requires Production and non-Production Secrets to be stored separately with different values. Create separate variables with different values before converting this one.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'production_secret_must_be_separate',
          message,
        },
        1
      );
    }
    output.fatal(message);
    return 1;
  }

  const preserveExistingVisibility =
    explicitType === undefined &&
    selectedEnv.visibility === 'secret' &&
    type !== 'sensitive';
  const { visibility: resolvedVisibility, error: visibilityError } =
    resolveEnvVarVisibility({
      explicitVisibility: typeOption.source ? explicitType : undefined,
      explicitOptionSource: typeOption.source,
      type,
      key: envName,
      envTargets: allTargets,
      teamSensitivePolicyOn,
      context: 'update',
    });
  const visibility = preserveExistingVisibility
    ? undefined
    : resolvedVisibility;
  const displayVisibility = preserveExistingVisibility
    ? selectedEnv.visibility
    : visibility;
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

  if (!opts['--yes']) {
    const visibilityLabel = formatVisibilityLabel(displayVisibility, type);
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Update ${envName} as ${visibilityLabel} in ${formatEnvironments(
            link,
            selectedEnv,
            customEnvironments
          )}? Use --yes to confirm.`,
          next: [
            {
              command: buildCommandWithYes(redactEnvValueArgs(client.argv)),
            },
          ],
        },
        1
      );
    }
    output.print('\n');
    printAlignedLabel('Project', `${link.org.slug}/${project.name}`);
    printAlignedLabel(
      'Environments',
      formatEnvironments(link, selectedEnv, customEnvironments)
    );
    if (visibilityLabel) {
      printAlignedLabel('Type', visibilityLabel);
    }
    const confirmed = await client.input.confirm(
      'Update this Environment Variable?',
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    output.spinner('Updating');
    const keyToUpdate = isFinalSecret() ? undefined : envName;
    await updateEnvRecord(
      client,
      project.id,
      selectedEnv.id,
      type,
      keyToUpdate,
      finalValue,
      allTargets,
      selectedEnv.gitBranch || '',
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

  output.print('\n');
  printAlignedLabel('Updated', envName, { gutter: '✓' });
  printAlignedLabel('Project', `${link.org.slug}/${project.name}`);
  printAlignedLabel(
    'Environments',
    formatEnvironments(link, selectedEnv, customEnvironments)
  );
  const visibilityLabel = formatVisibilityLabel(displayVisibility, type);
  if (visibilityLabel) {
    printAlignedLabel('Type', visibilityLabel);
  }

  return 0;
}

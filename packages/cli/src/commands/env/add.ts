import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import {
  getEnvTargetPlaceholder,
  envTargetChoices,
} from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import {
  getEnvKeyWarnings,
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
import { getLinkedProject } from '../../util/projects/link';
import { determineAgent } from '@vercel/detect-agent';
import { suggestNextCommands } from '../../util/suggest-next-commands';
import getTeamById from '../../util/teams/get-team-by-id';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvAddCommandWithPreservedArgs,
  getPreservedArgsForEnvAdd,
} from '../../util/agent-output';

type EnvType = 'encrypted' | 'sensitive';

/**
 * Per-target type resolution. The server silently promotes encrypted → sensitive
 * on policy-on teams for Production/Preview, and rejects sensitive on Development.
 * We mirror that server contract client-side so output and logs are honest.
 */
function resolveTypeForTarget(
  target: string,
  opts: { forceSensitive: boolean; forceEncrypted: boolean; policyOn: boolean }
): EnvType {
  if (target === 'development') {
    // Development never supports sensitive; caller is expected to have already
    // rejected --sensitive when only development is selected.
    return 'encrypted';
  }
  if (opts.forceEncrypted) return 'encrypted';
  if (opts.forceSensitive) return 'sensitive';
  if (opts.policyOn) return 'sensitive';
  // Default for Production/Preview/custom environments.
  return 'sensitive';
}

/**
 * For use in suggested "next" commands: escapes a value for shell if it contains spaces or quotes.
 */
function valueForNextCommand(value: string): string {
  if (!/[\s'"\\]/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Replaces placeholders in an env add command template with actual values when provided.
 */
function fillEnvAddTemplate(
  template: string,
  opts: {
    envName?: string;
    envTargetArg?: string;
    valueFromFlag?: string;
    envGitBranch?: string;
  }
): string {
  const targetPlaceholder = getEnvTargetPlaceholder();
  let out = template
    .replace(/<name>/g, opts.envName ?? '<name>')
    .split(targetPlaceholder)
    .join(opts.envTargetArg ?? targetPlaceholder)
    .replace(/<gitbranch>/g, opts.envGitBranch ?? '<gitbranch>');
  if (opts.valueFromFlag !== undefined) {
    out = out.replace(/<value>/g, valueForNextCommand(opts.valueFromFlag));
  } else {
    out = out.replace(/<value>/g, '<value>');
  }
  return out;
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
  let [envName, envTargetArg, envGitBranch] = args;

  const telemetryClient = new EnvAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliOptionValue(opts['--value']);
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagNoSensitive(opts['--no-sensitive']);
  telemetryClient.trackCliFlagForce(opts['--force']);
  telemetryClient.trackCliFlagGuidance(opts['--guidance']);
  telemetryClient.trackCliFlagYes(opts['--yes']);

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: string[] = [];
  if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  // Non-interactive: resolve link and choices once, then report all missing requirements in a single JSON (no iteration)
  if (client.nonInteractive) {
    const link = await getLinkedProject(client);
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
      let envAddRetryArgv = client.argv;
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
          envAddRetryArgv = [
            ...client.argv.slice(0, insertAt),
            '<gitbranch>',
            ...client.argv.slice(insertAt),
          ];
        }
      }
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
            { command: buildCommandWithYes(envAddRetryArgv) },
          ],
        },
        1
      );
    }
    if (link.status !== 'linked') return 1;
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
          return 'environment (production, preview, or development)';
        if (m === 'git_branch_required')
          return 'third argument <gitbranch> for Preview, or omit for all Preview branches';
        return m;
      });
      const fullTemplate = `env add <name> ${getEnvTargetPlaceholder()} <gitbranch> --value <value> --yes`;
      const filledTemplate = fillEnvAddTemplate(fullTemplate, {
        envName,
        envTargetArg,
        valueFromFlag,
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
          'env add <name> preview <gitbranch> --value <value> --yes',
          { envName, envTargetArg: 'preview', valueFromFlag }
        );
        const branchAll = fillEnvAddTemplate(
          'env add <name> preview --value <value> --yes',
          { envName, envTargetArg: 'preview', valueFromFlag }
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
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_requirements',
          missing,
          message: `Provide all required inputs for non-interactive mode: ${parts.join('; ')}. Example: ${filledTemplate}`,
          next,
        },
        1
      );
    }
  }

  if (!envName) {
    envName = await client.input.text({
      message: `What's the name of the variable?`,
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

  // Validate key name early (before value entry) with re-entry option
  const skipConfirm =
    opts['--yes'] || !!stdInput || valueFromFlag !== undefined;
  if (!skipConfirm) {
    let keyAccepted = false;
    while (!keyAccepted) {
      const keyWarnings = getEnvKeyWarnings(envName);
      const sensitiveWarning = keyWarnings.find(w => w.requiresConfirmation);

      if (!sensitiveWarning) {
        // Non-sensitive public prefix: just show info, no action needed
        for (const w of keyWarnings) {
          output.warn(w.message);
        }
        keyAccepted = true;
        break;
      }

      if (client.nonInteractive) {
        const nameWithoutPrefix = removePublicPrefix(envName);
        outputActionRequired(client, {
          status: 'action_required',
          reason: 'env_key_sensitive',
          message: `Key ${envName} may expose sensitive data (public prefix). Use --yes to keep as is, or rename to ${nameWithoutPrefix}.`,
          choices: [
            { id: 'keep', name: 'Leave as is (use --yes)' },
            { id: 'rename', name: `Rename to ${nameWithoutPrefix}` },
          ],
          next: [
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} ${getEnvTargetPlaceholder()} --value <value> --yes`
              ),
              when: 'Leave as is',
            },
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${nameWithoutPrefix} ${getEnvTargetPlaceholder()} --value <value> --yes`
              ),
              when: 'Rename',
            },
          ],
        });
      }

      // Sensitive public variable: show all warnings then options
      for (const w of keyWarnings) {
        output.warn(w.message);
      }

      const nameWithoutPrefix = removePublicPrefix(envName);
      const choices = [
        { name: 'Leave as is', value: 'c' },
        { name: `Rename to ${nameWithoutPrefix}`, value: 'p' },
        { name: 'Re-enter', value: 'r' },
      ];

      const action = await client.input.select({
        message: 'How to proceed?',
        choices,
      });

      if (action === 'c') {
        keyAccepted = true;
      } else if (action === 'p') {
        envName = nameWithoutPrefix;
        output.log(`Renamed to ${envName}`);
        // Loop back to re-validate (might have nested prefix)
      } else {
        envName = await client.input.text({
          message: `What's the name of the variable?`,
          validate: val => (val ? true : 'Name cannot be empty'),
        });
      }
    }
  } else {
    // Non-interactive: just show warnings
    const keyWarnings = getEnvKeyWarnings(envName);
    for (const w of keyWarnings) {
      output.warn(w.message);
    }
  }

  const link = await getLinkedProject(client);
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
      // Only add scope/project placeholders when project is not linked
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        ...(link.status === 'not_linked' ? ['--scope', '<scope>'] : []),
        ...linkPreserved,
      ];
      let envAddRetryArgv = client.argv;
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
          envAddRetryArgv = [
            ...client.argv.slice(0, insertAt),
            '<gitbranch>',
            ...client.argv.slice(insertAt),
          ];
        }
      }
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
            { command: buildCommandWithYes(envAddRetryArgv) },
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
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  const { project } = link;
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
  const choices: Array<{
    name: string;
    value: string;
    checked?: boolean;
    disabled?: boolean | string;
  }> = [
    ...envTargetChoices
      .filter(c => !existingTargets.has(c.value))
      .map(c => ({ name: c.name, value: c.value })),
    ...customEnvironments
      .filter(c => !existingCustomEnvs.has(c.id))
      .map(c => ({ name: c.slug, value: c.id })),
  ];

  if (!envGitBranch && choices.length === 0 && !opts['--force']) {
    output.error(
      `The variable ${param(
        envName
      )} has already been added to all Environments. To remove, run ${getCommandName(
        `env rm ${envName}`
      )}.`
    );
    return 1;
  }

  const forceSensitive = Boolean(opts['--sensitive']);
  const forceEncrypted = Boolean(opts['--no-sensitive']);

  if (forceSensitive && forceEncrypted) {
    output.error(
      `--sensitive and --no-sensitive cannot be used together. Pick one.`
    );
    return 1;
  }

  // Detect team-level sensitive env var policy. Reads from the team object
  // (cached). Only relevant when the linked org is a team.
  let policyOn = false;
  if (link.org.type === 'team') {
    try {
      const team = await getTeamById(client, link.org.id);
      policyOn = team?.sensitiveEnvironmentVariablePolicy === 'on';
    } catch {
      // Non-fatal — policy detection is best-effort.
    }
  }

  // When policy is on, Development is effectively disallowed because the
  // team policy requires sensitive Environment Variables and Development
  // does not support sensitive. Pre-check Production/Preview for the user
  // and mark Development as disallowed in the interactive checkbox.
  if (policyOn) {
    for (const choice of choices) {
      if (choice.value === 'development') {
        choice.disabled = '(disallowed)';
      } else if (choice.value === 'production' || choice.value === 'preview') {
        choice.checked = true;
      }
    }
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
          "In non-interactive mode provide the value via --value or stdin. Example: vercel env add <name> <environment> --value 'value' --yes",
        next: [
          {
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              `env add <name> ${getEnvTargetPlaceholder()} --value <value> --yes`
            ),
          },
        ],
      });
    }
    envValue = await client.input.password({
      message: `What's the value of ${envName}?`,
      mask: true,
    });
  }

  const { finalValue } = await validateEnvValue({
    envName,
    initialValue: envValue,
    skipConfirm,
    promptForValue: () =>
      client.input.password({
        message: `What's the value of ${envName}?`,
        mask: true,
      }),
    selectAction: choices =>
      client.input.select({ message: 'How to proceed?', choices }),
    showWarning: msg => output.warn(msg),
    showLog: msg => output.log(msg),
  });

  while (envTargets.length === 0) {
    if (client.nonInteractive && choices.length > 0) {
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_environment',
        message: `Specify at least one environment. Add as argument or use: ${buildEnvAddCommandWithPreservedArgs(
          client.argv,
          `env add ${envName} <environment> --value <value> --yes`
        )}`,
        choices: choices.map(c => ({
          id: c.value,
          name: typeof c.name === 'string' ? c.name : c.value,
        })),
        next: choices.slice(0, 5).map(c => ({
          command: buildEnvAddCommandWithPreservedArgs(
            client.argv,
            `env add ${envName} ${c.value} --value <value> --yes`
          ),
        })),
      });
    }
    envTargets = await client.input.checkbox({
      message: `Add ${envName} to which Environments (select multiple)?`,
      choices,
    });

    if (envTargets.length === 0) {
      output.error('Please select at least one Environment');
    }
  }

  if (
    envGitBranch === undefined &&
    envTargets.length === 1 &&
    envTargets[0] === 'preview'
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
                `env add ${envName} preview <gitbranch> --value <value> --yes`
              ),
              when: 'Add to a specific Git branch',
            },
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} preview --value <value> --yes`
              ),
              when: 'Add to all Preview branches',
            },
          ],
        },
        1
      );
    } else {
      envGitBranch = await client.input.text({
        message: `Add ${envName} to which Git branch? (leave empty for all Preview branches)?`,
      });
    }
  }

  const hasDevelopment = envTargets.includes('development');
  const hasSensitiveCapable = envTargets.some(t => t !== 'development');

  if (policyOn && hasDevelopment) {
    const msg = `Your team has enabled the Sensitive Environment Variables Policy and the Development Environment does not support sensitive values. https://vercel.com/docs/environment-variables/sensitive-environment-variables#environment-variables-policy`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'development_disallowed_by_team_policy',
          message: msg,
        },
        1
      );
    }
    output.error(msg);
    return 1;
  }

  if (forceSensitive && hasDevelopment) {
    const msg = `--sensitive is not allowed with the Development Environment. Sensitive Environment Variables are only supported on Production and Preview.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'sensitive_not_allowed_on_development',
          message: msg,
        },
        1
      );
    }
    output.error(msg);
    return 1;
  }

  if (hasDevelopment && hasSensitiveCapable) {
    const msg = `Development cannot be combined with other Environments because Development does not support sensitive Environment Variables. Run ${getCommandName(
      'env add'
    )} separately for Development.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'mixed_development_and_sensitive_capable_targets',
          message: msg,
        },
        1
      );
    }
    output.error(msg);
    return 1;
  }

  // At this point envTargets is either all-development or all non-development.
  let finalType: EnvType = resolveTypeForTarget(
    hasDevelopment ? 'development' : 'production',
    { forceSensitive, forceEncrypted, policyOn }
  );

  // Ask whether to keep it sensitive only when the user didn't say, the
  // policy isn't enforcing, and at least one target would actually use it.
  const userWasExplicit = forceSensitive || forceEncrypted;
  const canPromptForType =
    !client.nonInteractive &&
    !userWasExplicit &&
    !policyOn &&
    hasSensitiveCapable &&
    !skipConfirm;
  if (canPromptForType) {
    output.log(
      `Sensitive values cannot be retrieved later from the dashboard or CLI.`
    );
    const keepSensitive = await client.input.confirm(
      `Make it sensitive?`,
      true
    );
    if (!keepSensitive) {
      finalType = 'encrypted';
    }
  }

  if (policyOn && hasSensitiveCapable) {
    if (forceEncrypted) {
      // User asked for encrypted on Production/Preview, but the team policy
      // will promote it to sensitive server-side regardless. Surface that so
      // the user isn't surprised later.
      output.warn(
        `--no-sensitive is ignored: your team enforces sensitive Environment Variables for Production and Preview.`
      );
      finalType = 'sensitive';
    } else if (!userWasExplicit) {
      output.log(
        `Your team requires sensitive Environment Variables for Production and Preview.`
      );
    }
  }

  const upsert = opts['--force'] ? 'true' : '';

  const addStamp = stamp();
  try {
    output.spinner('Saving');
    await addEnvRecord(
      client,
      project.id,
      upsert,
      finalType,
      envName,
      finalValue,
      envTargets,
      envGitBranch
    );
  } catch (err: unknown) {
    if (client.nonInteractive && isAPIError(err)) {
      const reason =
        (err as { slug?: string }).slug ||
        (err.serverMessage?.toLowerCase().includes('branch')
          ? 'branch_not_found'
          : 'api_error');
      outputAgentError(
        client,
        {
          status: 'error',
          reason,
          message: err.serverMessage,
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

  output.print(
    `${prependEmoji(
      `${
        opts['--force'] ? 'Overrode' : 'Added'
      } Environment Variable ${chalk.bold(envName)} to Project ${chalk.bold(
        project.name
      )} ${chalk.gray(addStamp())}`,
      emoji('success')
    )}\n`
  );

  const { isAgent } = await determineAgent();
  const guidanceMode = parsedArgs.flags['--guidance'] ?? isAgent;

  if (guidanceMode) {
    suggestNextCommands([getCommandName(`env ls`), getCommandName(`env pull`)]);
  }

  return 0;
}

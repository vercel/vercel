import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { addSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  parsePosition,
  offerAutoPromote,
} from './shared';
import addRoute from '../../util/routes/add-route';
import getRouteVersions from '../../util/routes/get-route-versions';
import { parseConditions } from '../../util/routes/parse-conditions';
import { populateRouteEnv } from '../../util/routes/env';
import generateRouteApi, {
  type GenerateRouteResponse,
  type GeneratedRoute,
} from '../../util/routes/generate-route';
import {
  generatedRouteToAddInput,
  convertRouteToCurrentRoute,
  printGeneratedRoutePreview,
} from '../../util/routes/ai-transform';
import { runInteractiveEditLoop } from './edit-interactive';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { getCommandNameWithGlobalFlags } from '../../util/arg-common';
import { RoutesAddTelemetryClient } from '../../util/telemetry/commands/routes';
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CONDITIONS,
  VALID_SYNTAXES,
  REDIRECT_STATUS_CODES,
  stripQuotes,
  extractTransformFlags,
  collectHeadersAndTransforms,
  validateActionFlags,
  ALL_ACTION_CHOICES,
  collectActionDetails,
  collectInteractiveConditions,
} from '../../util/routes/interactive';
import type {
  AddRouteInput,
  EditableRoute,
  HasField,
  Transform,
  SrcSyntax,
  RoutePosition,
} from '../../util/routes/types';

function withGlobalFlags(client: Client, commandTemplate: string): string {
  return getCommandNameWithGlobalFlags(commandTemplate, client.argv);
}

/**
 * Shell-quote a token if it contains spaces or special chars.
 */
function shellQuoteArg(value: string): string {
  if (/[\s"'\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Build a routes add command string using provided parsed args/flags and
 * placeholders only for missing required pieces, then append global flags from argv.
 */
function buildRoutesAddFullFlagsSuggestion(
  client: Client,
  parsed: { args: string[]; flags: { [key: string]: unknown } }
): string {
  const { args, flags } = parsed;
  const parts: string[] = ['routes', 'add'];

  // Positional name: first arg may be subcommand name depending on parser
  let nameArg = args[0];
  if (nameArg === 'add' && args[1] && !args[1].startsWith('-')) {
    nameArg = args[1];
  }
  if (nameArg && !nameArg.startsWith('-')) {
    parts.push(shellQuoteArg(nameArg));
  } else {
    parts.push('<name>');
  }

  if (flags['--src']) {
    parts.push('--src', shellQuoteArg(String(flags['--src'])));
  } else {
    parts.push('--src', '<path>');
  }

  if (flags['--src-syntax']) {
    parts.push('--src-syntax', String(flags['--src-syntax']));
  }

  if (flags['--action']) {
    parts.push('--action', String(flags['--action']));
  } else {
    parts.push('--action', 'rewrite');
  }

  const action = flags['--action'] as string | undefined;
  if (flags['--dest']) {
    parts.push('--dest', shellQuoteArg(String(flags['--dest'])));
  } else if (!action || action === 'rewrite' || action === 'redirect') {
    parts.push('--dest', '<dest>');
  }

  if (flags['--status'] !== undefined && flags['--status'] !== null) {
    parts.push('--status', String(flags['--status']));
  }

  // --yes is not a global flag; append so non-interactive suggestion is runnable.
  parts.push('--yes');
  return withGlobalFlags(client, parts.join(' '));
}

/**
 * Adds a new route to the current project.
 */
export default async function add(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, addSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const isAgentMode = client.nonInteractive;
  const skipPrompts = (flags['--yes'] as boolean | undefined) || isAgentMode;

  const telemetry = new RoutesAddTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  telemetry.trackCliFlagYes(skipPrompts);
  telemetry.trackCliFlagDisabled(flags['--disabled'] as boolean | undefined);
  telemetry.trackCliArgumentName(args[0]);
  telemetry.trackCliOptionSrc(flags['--src'] as string | undefined);
  telemetry.trackCliOptionSrcSyntax(
    flags['--src-syntax'] as string | undefined
  );
  telemetry.trackCliOptionAction(flags['--action'] as string | undefined);
  telemetry.trackCliOptionDest(flags['--dest'] as string | undefined);
  telemetry.trackCliOptionStatus(flags['--status'] as number | undefined);
  telemetry.trackCliOptionPosition(flags['--position'] as string | undefined);
  telemetry.trackCliOptionDescription(
    flags['--description'] as string | undefined
  );
  telemetry.trackCliOptionSetResponseHeader(
    flags['--set-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendResponseHeader(
    flags['--append-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteResponseHeader(
    flags['--delete-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionSetRequestHeader(
    flags['--set-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendRequestHeader(
    flags['--append-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteRequestHeader(
    flags['--delete-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionSetRequestQuery(
    flags['--set-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendRequestQuery(
    flags['--append-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteRequestQuery(
    flags['--delete-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionHas(flags['--has'] as [string] | undefined);
  telemetry.trackCliOptionMissing(flags['--missing'] as [string] | undefined);
  telemetry.trackCliOptionAi(flags['--ai'] as string | undefined);

  // --- AI generation mode ---
  const aiPrompt = flags['--ai'] as string | undefined;

  if (isAgentMode && !aiPrompt && !flags['--src']) {
    // Non-interactive paths: (1) full flags, or (2) --ai PROMPT --yes which creates
    // without prompts when generation succeeds (handleAIAdd retries once on failure).
    // Second next command reuses name/action/etc. from argv; placeholders only for missing.
    const fullFlagsCmd = buildRoutesAddFullFlagsSuggestion(client, parsed);
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'In non-interactive mode pass either full route flags (name, --src, --action, --dest, --yes) or --ai <description> with --yes. For --src use a URL path pattern that starts with a forward slash / (e.g. /about, /api/:path*). With --src-syntax regex you may use a regex such as ^/api/.*. Run vercel routes add --help for options.',
        next: [
          {
            command: withGlobalFlags(
              client,
              'routes add --ai <description> --yes'
            ),
            when: 'AI generates the route and creates it without prompts when generation succeeds (replace <description>)',
          },
          {
            command: fullFlagsCmd,
            when: 'add missing --src/--dest (or other placeholders) to this command',
          },
        ],
        hint: 'Requires a CLI with the routes command. --src is a URL path: leading character must be / (forward slash). --ai --yes is non-interactive when the API returns a route; if it fails twice, use full flags or rephrase.',
      },
      1
    );
  }

  if (aiPrompt) {
    // Validate no conflicting flags
    const conflictingFlags = [
      '--src',
      '--src-syntax',
      '--action',
      '--dest',
      '--status',
      '--has',
      '--missing',
      '--set-response-header',
      '--append-response-header',
      '--delete-response-header',
      '--set-request-header',
      '--append-request-header',
      '--delete-request-header',
      '--set-request-query',
      '--append-request-query',
      '--delete-request-query',
      '--description',
      '--disabled',
      '--position',
    ];
    const usedConflicts = conflictingFlags.filter(f => flags[f] !== undefined);
    if (usedConflicts.length > 0) {
      output.error(
        `Cannot use --ai with ${usedConflicts.join(', ')}. Use --ai alone to generate a route from a description.`
      );
      return 1;
    }

    return await handleAIAdd(
      client,
      project.id,
      teamId,
      aiPrompt,
      skipPrompts,
      parsed
    );
  }

  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, project.id, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // --- Collect route name ---
  let name: string;
  const nameArg = args[0];

  if (nameArg) {
    if (nameArg.length > MAX_NAME_LENGTH) {
      output.error(`Route name must be ${MAX_NAME_LENGTH} characters or less.`);
      return 1;
    }
    name = nameArg;
  } else if (skipPrompts) {
    if (isAgentMode) {
      const fullFlagsCmd = buildRoutesAddFullFlagsSuggestion(client, parsed);
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message:
            'In non-interactive mode route name is required as the first argument.',
          next: [
            {
              command: fullFlagsCmd,
              when: 'replace <name> and any remaining placeholders',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Route name is required when using --yes. Usage: ${getCommandName('routes add "Route Name" --src "/path" --action rewrite --dest "/destination" --yes')}`
    );
    return 1;
  } else {
    // Offer AI or manual mode when fully interactive (no args, no flags)
    const hasAnyFlags =
      flags['--src'] !== undefined ||
      flags['--dest'] !== undefined ||
      flags['--status'] !== undefined;

    if (!hasAnyFlags) {
      const mode = await client.input.select({
        message: 'How would you like to create this route?',
        choices: [
          {
            name: 'Describe what you want (AI-powered)',
            value: 'ai',
          },
          { name: 'Build manually (step by step)', value: 'manual' },
        ],
      });

      if (mode === 'ai') {
        telemetry.trackCliOptionAi('interactive');
        return await handleAIAdd(
          client,
          project.id,
          teamId,
          undefined,
          skipPrompts,
          parsed
        );
      }
    }

    output.log('Add a new route\n');
    name = await client.input.text({
      message: 'Route name:',
      validate: val => {
        if (!val) return 'Route name is required';
        if (val.length > MAX_NAME_LENGTH)
          return `Name must be ${MAX_NAME_LENGTH} characters or less`;
        return true;
      },
    });
  }

  // --- Collect path pattern ---
  let src: string;
  let syntax: SrcSyntax = 'regex';

  if (flags['--src-syntax']) {
    const syntaxArg = flags['--src-syntax'] as string;
    if (!VALID_SYNTAXES.includes(syntaxArg as SrcSyntax)) {
      output.error(
        `Invalid syntax: "${syntaxArg}". Valid options: ${VALID_SYNTAXES.join(', ')}.`
      );
      return 1;
    }
    syntax = syntaxArg as SrcSyntax;
  }

  if (flags['--src']) {
    src = stripQuotes(flags['--src'] as string);
  } else if (skipPrompts) {
    if (isAgentMode) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message:
            'In non-interactive mode --src is required. It must be a URL path pattern starting with forward slash / (e.g. /old-page, /api/:path*). Not a Windows path and not backslash. Use --src-syntax regex only if you need a regex pattern.',
          next: [
            {
              command: buildRoutesAddFullFlagsSuggestion(client, parsed),
              when: 'set --src to a path starting with /',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Source path is required when using --yes. Usage: ${getCommandName('routes add "Name" --src "/path" --action rewrite --dest "/dest" --yes')}`
    );
    return 1;
  } else {
    const syntaxChoice = await client.input.select({
      message: 'How do you want to specify the path?',
      choices: [
        {
          name: 'Path pattern (e.g., /api/:version/users/:id)',
          value: 'path-to-regexp',
        },
        { name: 'Exact match (e.g., /about)', value: 'equals' },
        { name: 'Regular expression (e.g., ^/api/(.*)$)', value: 'regex' },
      ],
    });
    syntax = syntaxChoice as SrcSyntax;

    const syntaxHelp =
      syntax === 'path-to-regexp'
        ? 'Use :param for parameters, :param* for optional wildcard'
        : syntax === 'equals'
          ? 'Enter the exact path to match'
          : 'Enter a regular expression pattern';

    src = await client.input.text({
      message: `Path pattern (${syntaxHelp}):`,
      validate: val => {
        if (!val) return 'Path pattern is required';
        if (syntax !== 'regex' && !val.startsWith('/')) {
          return 'Path must start with / and be a valid URL path';
        }
        return true;
      },
    });
  }

  // Validate path starts with / for non-regex syntax (URL path, not filesystem backslash)
  if (syntax !== 'regex' && !src.startsWith('/')) {
    const pathMsg =
      '--src must start with a forward slash / (URL path root). Examples: /about, /api/:path*. Backslash \\ is wrong. If you need a regex, pass --src-syntax regex and a pattern like ^/api/.*';
    if (isAgentMode) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: pathMsg,
          next: [
            {
              command: buildRoutesAddFullFlagsSuggestion(client, parsed),
              when: 'prefix --src with / or use --src-syntax regex',
            },
          ],
          hint: 'Route source is matched against request URL paths; they always begin with /.',
        },
        1
      );
    }
    output.error(
      'Path must start with / (forward slash). Use --src-syntax regex for regex patterns.'
    );
    return 1;
  }

  // --- Validate --action flag (flag-based mode) ---
  const actionFlag = flags['--action'] as string | undefined;
  const dest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const status = flags['--status'] as number | undefined;

  // In flag-based mode, --action is required when --dest or --status is provided
  const actionError = validateActionFlags(actionFlag, dest, status);
  if (actionError) {
    if (isAgentMode) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: actionError,
          next: [
            {
              command: buildRoutesAddFullFlagsSuggestion(client, parsed),
              when: 'fix flags per message (e.g. add --dest for rewrite, --status for redirect)',
            },
          ],
        },
        1
      );
    }
    output.error(actionError);
    return 1;
  }

  // Collect transforms from flags
  let headers: Record<string, string> = {};
  let transforms: Transform[] = [];

  try {
    const transformFlags = extractTransformFlags(flags);
    const collected = collectHeadersAndTransforms(transformFlags);
    headers = collected.headers;
    transforms = collected.transforms;
  } catch (e) {
    output.error(
      `Invalid transform format. ${e instanceof Error ? e.message : ''}`
    );
    return 1;
  }

  const hasAnyAction =
    dest || status || Object.keys(headers).length > 0 || transforms.length > 0;

  // Require at least one action when using --yes
  if (!hasAnyAction && skipPrompts) {
    if (isAgentMode) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message:
            'In non-interactive mode at least one action is required. Use --action with --dest or --status, or header/transform flags.',
          next: [
            {
              command: buildRoutesAddFullFlagsSuggestion(client, parsed),
              when: 'example rewrite action; adjust --action/--dest/--status as needed',
            },
          ],
        },
        1
      );
    }
    output.error(
      'At least one action is required when using --yes. Use --action with --dest/--status, or header/transform flags.'
    );
    return 1;
  }

  // --- Interactive mode: conditions first, then action selection loop ---
  if (!hasAnyAction && !skipPrompts) {
    const addConditions = await client.input.confirm(
      'Add conditions (has/does not have)?',
      false
    );

    if (addConditions) {
      await collectInteractiveConditions(client, flags);
    }

    // Action selection loop
    const availableActions = [...ALL_ACTION_CHOICES];
    let actionCount = 0;

    for (;;) {
      const choices = [...availableActions];

      if (actionCount > 0) {
        choices.push({ name: 'Done', value: 'done' });
      }

      const actionType = await client.input.select({
        message:
          actionCount === 0
            ? 'What action should this route perform?'
            : 'Add another action:',
        choices: choices.map(c => ({ name: c.name, value: c.value })),
      });

      if (actionType === 'done') break;

      await collectActionDetails(client, actionType, flags);
      actionCount++;

      // Remove exclusive actions once one is selected
      const selectedChoice = ALL_ACTION_CHOICES.find(
        c => c.value === actionType
      );
      if (selectedChoice?.exclusive) {
        const exclusiveValues = ALL_ACTION_CHOICES.filter(c => c.exclusive).map(
          c => c.value
        );
        for (const val of exclusiveValues) {
          const idx = availableActions.findIndex(a => a.value === val);
          if (idx !== -1) availableActions.splice(idx, 1);
        }
      }

      if (availableActions.length === 0) break;
    }

    // Description
    const addDescription = await client.input.confirm(
      'Add a description?',
      false
    );

    if (addDescription) {
      const desc = await client.input.text({
        message: 'Description:',
        validate: val =>
          val && val.length > MAX_DESCRIPTION_LENGTH
            ? `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
            : true,
      });
      if (desc) {
        Object.assign(flags, { '--description': desc });
      }
    }

    // Position
    const customPosition = await client.input.confirm(
      'Set route position? (default: end)',
      false
    );

    if (customPosition) {
      const positionChoice = await client.input.select({
        message: 'Position:',
        choices: [
          { name: 'Start - First route (highest priority)', value: 'start' },
          { name: 'End - Last route (lowest priority)', value: 'end' },
          { name: 'Before specific route', value: 'before' },
          { name: 'After specific route', value: 'after' },
        ],
      });

      if (positionChoice === 'before' || positionChoice === 'after') {
        const refId = await client.input.text({
          message: `Route ID to place ${positionChoice}:`,
          validate: val => (val ? true : 'Route ID is required'),
        });
        Object.assign(flags, { '--position': `${positionChoice}:${refId}` });
      } else {
        Object.assign(flags, { '--position': positionChoice });
      }
    }
  }

  // --- Re-collect after interactive input ---
  const finalDest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const finalStatus = flags['--status'] as number | undefined;

  // Re-collect transforms after interactive input (flags may have been modified)
  try {
    const finalTransformFlags = extractTransformFlags(flags);
    const collected = collectHeadersAndTransforms(finalTransformFlags);
    headers = collected.headers;
    transforms = collected.transforms;
  } catch (e) {
    output.error(
      `Invalid transform format. ${e instanceof Error ? e.message : ''}`
    );
    return 1;
  }

  // --- Collect conditions ---
  let hasConditions: HasField[] = [];
  let missingConditions: HasField[] = [];

  const hasFlags = flags['--has'] as string[] | undefined;
  const missingFlags = flags['--missing'] as string[] | undefined;

  try {
    if (hasFlags) {
      hasConditions = parseConditions(hasFlags);
    }
    if (missingFlags) {
      missingConditions = parseConditions(missingFlags);
    }
  } catch (e) {
    output.error(e instanceof Error ? e.message : 'Invalid condition format');
    return 1;
  }

  const totalConditions = hasConditions.length + missingConditions.length;
  if (totalConditions > MAX_CONDITIONS) {
    output.error(
      `Too many conditions: ${totalConditions}. Maximum is ${MAX_CONDITIONS}.`
    );
    return 1;
  }

  // --- Collect description ---
  const description: string | undefined = flags['--description'] as
    | string
    | undefined;

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    output.error(
      `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`
    );
    return 1;
  }

  // --- Collect position ---
  let position: RoutePosition | undefined;
  const positionFlag = flags['--position'] as string | undefined;

  if (positionFlag) {
    try {
      position = parsePosition(positionFlag);
    } catch (e) {
      output.error(`${e instanceof Error ? e.message : 'Invalid position'}`);
      return 1;
    }
  }

  // --- Build route input ---
  const isRedirect =
    finalDest && finalStatus && REDIRECT_STATUS_CODES.includes(finalStatus);

  // Track telemetry
  telemetry.trackCliFlagHasConditions(hasConditions.length > 0);
  telemetry.trackCliFlagMissingConditions(missingConditions.length > 0);
  telemetry.trackCliFlagResponseHeaders(Object.keys(headers).length > 0);
  telemetry.trackCliFlagRequestTransforms(transforms.length > 0);

  if (isRedirect) {
    telemetry.trackCliActionType('redirect');
  } else if (finalDest) {
    telemetry.trackCliActionType('rewrite');
  } else if (finalStatus) {
    telemetry.trackCliActionType('set-status');
  } else if (Object.keys(headers).length > 0 || transforms.length > 0) {
    telemetry.trackCliActionType('modify');
  }

  const routeInput: AddRouteInput = {
    name,
    description,
    enabled: !flags['--disabled'],
    srcSyntax: syntax,
    route: {
      src,
      ...(finalDest && { dest: finalDest }),
      ...(finalStatus && { status: finalStatus }),
      ...(Object.keys(headers).length > 0 && { headers }),
      ...(transforms.length > 0 && { transforms }),
      ...(hasConditions.length > 0 && { has: hasConditions }),
      ...(missingConditions.length > 0 && { missing: missingConditions }),
    },
  };

  // Populate env fields for $VAR references
  populateRouteEnv(routeInput.route);

  // --- Create the route ---
  const addStamp = stamp();
  output.spinner(`Adding route "${name}"`);

  try {
    const { route, version } = await addRoute(client, project.id, routeInput, {
      teamId,
      position,
    });

    if (isAgentMode) {
      output.stopSpinner();
      const jsonOutput: Record<string, unknown> = {
        status: 'ok',
        route: {
          id: route.id,
          name: route.name,
          src,
          ...(finalDest && { dest: finalDest }),
          ...(finalStatus && { status: finalStatus }),
        },
        version: {
          id: version.id,
          ...(version.alias && { alias: version.alias }),
        },
        ...(!existingStagingVersion && {
          next: [
            {
              command: withGlobalFlags(client, 'routes publish --yes'),
              when: 'to promote this version to production',
            },
          ],
        }),
        ...(existingStagingVersion && {
          hint: 'Review staged changes with vercel routes list --diff before promoting.',
        }),
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
      return 0;
    }

    output.log(
      `${chalk.cyan('Created')} route "${name}" ${chalk.gray(addStamp())}`
    );

    output.print(`\n  ${chalk.bold('Route:')} ${route.name}\n`);
    output.print(`  ${chalk.gray('ID:')} ${route.id}\n`);
    output.print(`  ${chalk.gray('Path:')} ${src}\n`);

    if (finalDest) {
      if (isRedirect) {
        output.print(
          `  ${chalk.gray('Redirect:')} ${finalDest} (${finalStatus})\n`
        );
      } else {
        output.print(`  ${chalk.gray('Rewrite:')} ${finalDest}\n`);
      }
    } else if (finalStatus) {
      output.print(`  ${chalk.gray('Status:')} ${finalStatus}\n`);
    }

    if (Object.keys(headers).length > 0) {
      output.print(
        `  ${chalk.gray('Headers:')} ${Object.keys(headers).length} header(s)\n`
      );
    }

    if (transforms.length > 0) {
      output.print(
        `  ${chalk.gray('Transforms:')} ${transforms.length} transform(s)\n`
      );
    }

    if (hasConditions.length > 0 || missingConditions.length > 0) {
      output.print(
        `  ${chalk.gray('Conditions:')} ${hasConditions.length} has, ${missingConditions.length} missing\n`
      );
    }

    if (version.alias) {
      let testPath = '/';
      if (syntax === 'equals') {
        testPath = src;
      } else if (syntax === 'path-to-regexp') {
        testPath = src.replace(/:\w+\*/g, 'test').replace(/:\w+/g, 'test');
      } else if (src.startsWith('/')) {
        testPath = '/';
      }
      output.print(
        `\n  ${chalk.bold('Test your changes:')} ${chalk.cyan(`https://${version.alias}${testPath}`)}\n`
      );
    }

    output.print(`\n  ${chalk.bold('Staging version:')} ${version.id}\n`);

    await offerAutoPromote(
      client,
      project.id,
      version,
      !!existingStagingVersion,
      { teamId, skipPrompts }
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    if (isAgentMode) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.ROUTE_CREATE_FAILED,
          message:
            'Route creation failed for this project. See hint for next steps.',
          hint:
            error.message ||
            'Use `vercel routes list --diff` to inspect staged routes, then adjust flags and retry.',
          next: [
            {
              command: withGlobalFlags(client, 'routes list --diff'),
              when: 'to inspect staged state',
            },
          ],
        },
        1
      );
    }
    output.error(error.message || 'Failed to create route');
    return 1;
  }
}

/**
 * Handles AI-powered route creation.
 * If aiPrompt is provided, uses it directly. Otherwise prompts interactively.
 */
async function handleAIAdd(
  client: Client,
  projectId: string,
  teamId: string | undefined,
  aiPrompt: string | undefined,
  skipPrompts: boolean | undefined,
  parsedForSuggestion?: { args: string[]; flags: { [key: string]: unknown } }
): Promise<number> {
  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, projectId, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // Retry loop: if generation fails, let the user rephrase their prompt.
  // In non-interactive mode with --yes, retry the same prompt once (transient API failures).
  // Breaks out on success; exits on --yes/non-TTY or user cancel.
  let prompt = aiPrompt;
  let currentGenerated;
  let nonInteractiveGenerationRetries = 0;
  for (;;) {
    if (!prompt) {
      prompt = await client.input.text({
        message: 'Describe the route you want to create:',
        validate: val => {
          if (!val) return 'A description is required';
          if (val.length > 2000)
            return 'Description must be 2000 characters or less';
          return true;
        },
      });
    }

    output.spinner('Generating route...');

    let errorMessage: string | undefined;
    try {
      const result = await generateRouteApi(
        client,
        projectId,
        { prompt },
        { teamId }
      );

      if (result.error) {
        errorMessage = result.error;
      } else if (!result.route) {
        errorMessage =
          'Could not generate a route from that description. Try rephrasing.';
      } else {
        currentGenerated = result.route;
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      errorMessage = error.message || 'Failed to generate route';
    }

    if (currentGenerated) {
      break;
    }

    if (client.nonInteractive || skipPrompts || !client.stdin.isTTY) {
      // One automatic retry with same prompt (no TTY) before failing.
      if (skipPrompts && nonInteractiveGenerationRetries < 1) {
        nonInteractiveGenerationRetries++;
        output.stopSpinner();
        output.spinner('Generating route... (retry)');
        continue;
      }
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.ROUTE_GENERATION_FAILED,
          message:
            errorMessage ||
            'Could not generate a route after retry. Rephrase --ai description or use full route flags.',
          next: [
            {
              command: withGlobalFlags(
                client,
                'routes add --ai <description> --yes'
              ),
              when: 'retry with a clearer description (replace <description>)',
            },
            {
              command: parsedForSuggestion
                ? buildRoutesAddFullFlagsSuggestion(client, parsedForSuggestion)
                : withGlobalFlags(
                    client,
                    'routes add <name> --src <path> --action rewrite --dest <dest> --yes'
                  ),
              when: 'add with explicit flags if AI keeps failing',
            },
          ],
          hint: 'Non-interactive --ai runs up to two generation attempts then exits with JSON.',
        },
        1
      );
    }
    output.error(errorMessage!);

    if (skipPrompts || !client.stdin.isTTY) {
      return 1;
    }

    const retry = await client.input.select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Try again with a different description', value: 'retry' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (retry === 'cancel') {
      output.log('Cancelled.');
      return 0;
    }

    // Clear prompt so it's re-prompted on next iteration
    prompt = undefined;
  }

  printGeneratedRoutePreview(currentGenerated);

  // If --yes, create immediately
  if (skipPrompts) {
    return await createFromGenerated(
      client,
      projectId,
      teamId,
      currentGenerated,
      existingStagingVersion,
      skipPrompts
    );
  }

  if (!client.stdin.isTTY) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.CONFIRMATION_REQUIRED,
          message:
            'Route creation from AI preview requires a TTY to confirm, or use full flags with --yes non-interactively.',
          next: [
            {
              command: parsedForSuggestion
                ? buildRoutesAddFullFlagsSuggestion(client, parsedForSuggestion)
                : withGlobalFlags(
                    client,
                    'routes add <name> --src <path> --action rewrite --dest <dest> --yes'
                  ),
              when: 'non-interactive add without AI preview',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Cannot interactively confirm route creation in a non-TTY environment. Use full route flags with ${getCommandName('routes add <name> --src ... --yes')}, or run in a TTY.`
    );
    return 1;
  }

  for (;;) {
    const choice = await client.input.select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Create this route', value: 'create' },
        { name: 'Edit with AI (describe changes)', value: 'ai-edit' },
        { name: 'Edit manually', value: 'manual' },
        { name: 'Discard', value: 'discard' },
      ],
      pageSize: 4,
      loop: false,
    });

    if (choice === 'create') {
      return await createFromGenerated(
        client,
        projectId,
        teamId,
        currentGenerated,
        existingStagingVersion,
        skipPrompts
      );
    }

    if (choice === 'ai-edit') {
      const editPrompt = await client.input.text({
        message: "Describe what you'd like to change:",
        validate: val => {
          if (!val) return 'A description is required';
          if (val.length > 2000)
            return 'Description must be 2000 characters or less';
          return true;
        },
      });

      output.spinner('Updating route...');

      try {
        const editResult: GenerateRouteResponse = await generateRouteApi(
          client,
          projectId,
          {
            prompt: editPrompt,
            currentRoute: convertRouteToCurrentRoute(currentGenerated),
          },
          { teamId }
        );

        if (editResult.error) {
          output.error(editResult.error);
          output.log('Keeping previous route:');
          printGeneratedRoutePreview(currentGenerated);
          continue;
        }
        if (!editResult.route) {
          output.error('Could not apply changes. Try rephrasing.');
          output.log('Keeping previous route:');
          printGeneratedRoutePreview(currentGenerated);
          continue;
        }

        currentGenerated = editResult.route;
        printGeneratedRoutePreview(currentGenerated);
      } catch (e: unknown) {
        const error = e as { message?: string };
        output.error(error.message || 'Failed to update route');
        output.log('Keeping previous route:');
        printGeneratedRoutePreview(currentGenerated);
      }
      continue;
    }

    if (choice === 'manual') {
      const routeInput = generatedRouteToAddInput(currentGenerated);
      const tempRule: EditableRoute = {
        name: routeInput.name,
        description: routeInput.description,
        enabled: true,
        srcSyntax: routeInput.srcSyntax,
        route: routeInput.route,
      };

      await runInteractiveEditLoop(client, tempRule);
      populateRouteEnv(tempRule.route);

      const addStamp = stamp();
      output.spinner(`Adding route "${tempRule.name}"`);

      try {
        const { route, version } = await addRoute(
          client,
          projectId,
          {
            name: tempRule.name,
            description: tempRule.description,
            srcSyntax: tempRule.srcSyntax,
            route: tempRule.route as AddRouteInput['route'],
          },
          { teamId }
        );

        output.log(
          `${chalk.cyan('Created')} route "${route.name}" ${chalk.gray(addStamp())}`
        );

        output.print(`\n  ${chalk.bold('Route:')} ${route.name}\n`);
        output.print(`  ${chalk.gray('ID:')} ${route.id}\n`);
        output.print(`\n  ${chalk.bold('Staging version:')} ${version.id}\n`);

        await offerAutoPromote(
          client,
          projectId,
          version,
          !!existingStagingVersion,
          { teamId, skipPrompts }
        );

        return 0;
      } catch (e: unknown) {
        const error = e as { message?: string };
        output.error(error.message || 'Failed to create route');
        return 1;
      }
    }

    // Discard
    output.log('Discarded.');
    return 0;
  }
}

/**
 * Creates a route from an AI-generated route object.
 */
async function createFromGenerated(
  client: Client,
  projectId: string,
  teamId: string | undefined,
  generated: GeneratedRoute,
  existingStagingVersion: { isStaging?: boolean } | undefined,
  skipPrompts: boolean | undefined
): Promise<number> {
  const routeInput = generatedRouteToAddInput(generated);
  populateRouteEnv(routeInput.route);

  const addStamp = stamp();
  output.spinner(`Adding route "${routeInput.name}"`);

  try {
    const { route, version } = await addRoute(client, projectId, routeInput, {
      teamId,
    });

    if (client.nonInteractive) {
      output.stopSpinner();
      const jsonOutput: Record<string, unknown> = {
        status: 'ok',
        route: {
          id: route.id,
          name: route.name,
          src: routeInput.route.src,
        },
        version: {
          id: version.id,
          ...(version.alias && { alias: version.alias }),
        },
        ...(!existingStagingVersion && {
          next: [
            {
              command: withGlobalFlags(client, 'routes publish --yes'),
              when: 'to promote this version to production',
            },
          ],
        }),
        ...(existingStagingVersion && {
          hint: 'Review staged changes with vercel routes list --diff before promoting.',
        }),
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
      return 0;
    }

    output.log(
      `${chalk.cyan('Created')} route "${route.name}" ${chalk.gray(addStamp())}`
    );

    output.print(`\n  ${chalk.bold('Route:')} ${route.name}\n`);
    output.print(`  ${chalk.gray('ID:')} ${route.id}\n`);

    output.print(`\n  ${chalk.bold('Staging version:')} ${version.id}\n`);

    await offerAutoPromote(
      client,
      projectId,
      version,
      !!existingStagingVersion,
      { teamId, skipPrompts }
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.ROUTE_CREATE_FAILED,
          message:
            'Route creation failed for this project. See hint for next steps.',
          hint:
            error.message ||
            'Use `vercel routes list --diff` to inspect staged routes, then adjust flags and retry.',
          next: [
            {
              command: withGlobalFlags(client, 'routes list --diff'),
              when: 'to inspect staged state',
            },
          ],
        },
        1
      );
    }
    output.error(error.message || 'Failed to create route');
    return 1;
  }
}

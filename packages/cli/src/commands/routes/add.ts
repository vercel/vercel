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
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
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
  hasAnyTransformFlags,
  validateActionFlags,
  ALL_ACTION_CHOICES,
  collectActionDetails,
  collectInteractiveConditions,
} from '../../util/routes/interactive';
import type {
  AddRouteInput,
  HasField,
  Transform,
  SrcSyntax,
  RoutePosition,
} from '../../util/routes/types';

/**
 * Adds a new route to the current project.
 */
export default async function add(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, addSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const skipPrompts = flags['--yes'] as boolean | undefined;

  // Initialize telemetry client
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
    output.error(
      `Route name is required when using --yes. Usage: ${getCommandName('routes add "Route Name" --src "/path" --action rewrite --dest "/destination" --yes')}`
    );
    return 1;
  } else {
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

  // Validate path starts with / for non-regex syntax
  if (syntax !== 'regex' && !src.startsWith('/')) {
    output.error('Path must start with / and be a valid URL path');
    return 1;
  }

  // --- Validate --action flag (flag-based mode) ---
  const actionFlag = flags['--action'] as string | undefined;
  const dest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const status = flags['--status'] as number | undefined;
  const hasTransforms = hasAnyTransformFlags(flags);

  // In flag-based mode, --action is required when --dest or --status is provided
  const actionError = validateActionFlags(actionFlag, dest, status);
  if (actionError) {
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
    output.error(
      'At least one action is required when using --yes. Use --action with --dest/--status, or header/transform flags.'
    );
    return 1;
  }

  // --- Interactive mode: conditions first, then action selection loop ---
  if (!hasAnyAction && !skipPrompts) {
    const addConditions = await client.input.confirm(
      'Add conditions (has/missing)?',
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

  // --- Create the route ---
  const addStamp = stamp();
  output.spinner(`Adding route "${name}"`);

  try {
    const { route, version } = await addRoute(client, project.id, routeInput, {
      teamId,
      position,
    });

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
    const error = e as { message?: string; code?: string };
    if (error.code === 'feature_not_enabled') {
      output.error(
        'Project-level routes are not enabled for this project. Please contact support.'
      );
    } else {
      output.error(error.message || 'Failed to create route');
    }
    return 1;
  }
}

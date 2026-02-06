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
import {
  collectTransforms,
  collectResponseHeaders,
  type TransformFlags,
} from '../../util/routes/parse-transforms';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { RoutesAddTelemetryClient } from '../../util/telemetry/commands/routes';
import type {
  AddRouteInput,
  HasField,
  Transform,
  SrcSyntax,
  RoutePosition,
} from '../../util/routes/types';

// Constants for validation limits
const MAX_NAME_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_CONDITIONS = 16;
const VALID_SYNTAXES: SrcSyntax[] = ['regex', 'path-to-regexp', 'equals'];
const REDIRECT_STATUS_CODES = [301, 302, 307, 308];

/**
 * Strips leading and trailing quotes (single or double) from a string.
 * This is a safeguard against accidental quote inclusion in CLI arguments.
 */
function stripQuotes(str: string): string {
  // Check for matching double quotes
  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
    return str.slice(1, -1);
  }
  // Check for matching single quotes
  if (str.startsWith("'") && str.endsWith("'") && str.length >= 2) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Extracts transform flags from parsed CLI flags into a typed object.
 */
function extractTransformFlags(flags: Record<string, unknown>): TransformFlags {
  return {
    setResponseHeader: flags['--set-response-header'] as string[] | undefined,
    appendResponseHeader: flags['--append-response-header'] as
      | string[]
      | undefined,
    deleteResponseHeader: flags['--delete-response-header'] as
      | string[]
      | undefined,
    setRequestHeader: flags['--set-request-header'] as string[] | undefined,
    appendRequestHeader: flags['--append-request-header'] as
      | string[]
      | undefined,
    deleteRequestHeader: flags['--delete-request-header'] as
      | string[]
      | undefined,
    setRequestQuery: flags['--set-request-query'] as string[] | undefined,
    appendRequestQuery: flags['--append-request-query'] as string[] | undefined,
    deleteRequestQuery: flags['--delete-request-query'] as string[] | undefined,
  };
}

/**
 * Collects headers and transforms from transform flags.
 * Response header 'set' operations go to headers object (matching front-end behavior).
 * All other operations go to transforms array.
 */
function collectHeadersAndTransforms(transformFlags: TransformFlags): {
  headers: Record<string, string>;
  transforms: Transform[];
} {
  // Response header 'set' operations go to headers object
  const headers = transformFlags.setResponseHeader
    ? collectResponseHeaders(transformFlags.setResponseHeader)
    : {};

  // All other operations go to transforms (including response header append/delete)
  const transforms = collectTransforms({
    ...transformFlags,
    setResponseHeader: undefined, // Already handled in headers
  });

  return { headers, transforms };
}

/**
 * Escapes special regex characters in a string.
 * Used for building condition value patterns (equals, contains).
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Condition operators that match the frontend's behavior.
 * Each operator compiles user input to a regex pattern for the API.
 */
type ConditionOperator = 'eq' | 'contains' | 're' | 'exists';

/**
 * Compiles a condition operator and value to a regex pattern for the API.
 * Matches the frontend's buildConditionValue() in form-state.ts.
 */
function buildConditionValue(
  operator: ConditionOperator,
  value: string,
): string | undefined {
  if (operator === 'exists') return undefined;
  if (operator === 're') return value;
  const escapedValue = escapeRegExp(value);
  if (operator === 'contains') return `.*${escapedValue}.*`;
  // 'eq'
  return `^${escapedValue}$`;
}

/**
 * Interactive action types. Exclusive actions (rewrite, redirect, set-status) can only
 * be selected once and are removed from the list after selection. Non-exclusive modify
 * actions can be added alongside any other action.
 */
interface ActionChoice {
  name: string;
  value: string;
  exclusive?: boolean;
}

const ALL_ACTION_CHOICES: ActionChoice[] = [
  { name: 'Rewrite', value: 'rewrite', exclusive: true },
  { name: 'Redirect', value: 'redirect', exclusive: true },
  { name: 'Set Status Code', value: 'set-status', exclusive: true },
  { name: 'Response Headers', value: 'response-headers' },
  { name: 'Request Headers', value: 'request-headers' },
  { name: 'Request Query', value: 'request-query' },
];

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

  // Track initial flags
  telemetry.trackCliFlagYes(skipPrompts);
  telemetry.trackCliFlagDisabled(flags['--disabled'] as boolean | undefined);
  telemetry.trackCliOptionSyntax(flags['--syntax'] as string | undefined);
  telemetry.trackCliOptionPosition(flags['--position'] as string | undefined);
  telemetry.trackCliOptionStatus(flags['--status'] as number | undefined);

  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, project.id, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // --- Collect route name ---
  let name: string;
  const nameArg = args[0];

  if (nameArg) {
    if (nameArg.length > MAX_NAME_LENGTH) {
      output.error(
        `Route name must be ${MAX_NAME_LENGTH} characters or less. Usage: ${getCommandName('routes add "Route Name" --src "/path" --dest "/destination"')}`
      );
      return 1;
    }
    name = nameArg;
  } else if (skipPrompts) {
    output.error(
      `Route name is required when using --yes. Usage: ${getCommandName('routes add "Route Name" --src "/path" --dest "/destination" --yes')}`
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

  if (flags['--syntax']) {
    const syntaxArg = flags['--syntax'] as string;
    if (!VALID_SYNTAXES.includes(syntaxArg as SrcSyntax)) {
      output.error(
        `Invalid syntax: "${syntaxArg}". Valid options: ${VALID_SYNTAXES.join(', ')}. Usage: ${getCommandName('routes add "Name" --src "/path" --syntax path-to-regexp')}`
      );
      return 1;
    }
    syntax = syntaxArg as SrcSyntax;
  }

  if (flags['--src']) {
    src = stripQuotes(flags['--src'] as string);
  } else if (skipPrompts) {
    output.error(
      `Source path is required when using --yes. Usage: ${getCommandName('routes add "Route Name" --src "/path" --dest "/destination" --yes')}`
    );
    return 1;
  } else {
    // Interactive syntax selection
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
        return true;
      },
    });
  }

  // --- Collect action ---
  const dest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const status = flags['--status'] as number | undefined;

  // Collect transforms from flags using helper functions
  const transformFlags = extractTransformFlags(flags);
  let headers: Record<string, string> = {};
  let transforms: Transform[] = [];

  try {
    const collected = collectHeadersAndTransforms(transformFlags);
    headers = collected.headers;
    transforms = collected.transforms;
  } catch (e) {
    output.error(
      `Invalid transform format. ${e instanceof Error ? e.message : ''} Usage: ${getCommandName('routes add "Name" --set-response-header "Key=Value"')}`
    );
    return 1;
  }

  const hasAnyAction =
    dest || status || Object.keys(headers).length > 0 || transforms.length > 0;

  // Require at least one action when using --yes
  if (!hasAnyAction && skipPrompts) {
    output.error(
      `At least one action is required when using --yes. Use --dest, --status, or header/transform flags.`
    );
    return 1;
  }

  // Interactive mode: conditions first, then action selection loop
  if (!hasAnyAction && !skipPrompts) {
    // --- Conditions (before actions) ---
    const addConditions = await client.input.confirm(
      'Add conditions (has/missing)?',
      false
    );

    if (addConditions) {
      await collectInteractiveConditions(client, flags);
    }

    // --- Action selection loop ---
    const availableActions = [...ALL_ACTION_CHOICES];
    let hasExclusiveAction = false;
    let actionCount = 0;

    while (true) {
      const choices = [...availableActions];

      // Only show "Done" after at least one action has been added
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

      // Handle the selected action
      switch (actionType) {
        case 'rewrite': {
          const rewriteDest = await client.input.text({
            message: 'Destination URL:',
            validate: val => (val ? true : 'Destination is required'),
          });
          Object.assign(flags, { '--dest': rewriteDest });
          break;
        }
        case 'redirect': {
          const redirectDest = await client.input.text({
            message: 'Destination URL:',
            validate: val => (val ? true : 'Destination is required'),
          });
          const redirectStatus = await client.input.select({
            message: 'Status code:',
            choices: [
              {
                name: '307 - Temporary Redirect (preserves method)',
                value: 307,
              },
              {
                name: '308 - Permanent Redirect (preserves method)',
                value: 308,
              },
              {
                name: '301 - Moved Permanently (may change to GET)',
                value: 301,
              },
              { name: '302 - Found (may change to GET)', value: 302 },
            ],
          });
          Object.assign(flags, {
            '--dest': redirectDest,
            '--status': redirectStatus,
          });
          break;
        }
        case 'set-status': {
          const statusCode = await client.input.text({
            message: 'HTTP status code:',
            validate: val => {
              const num = parseInt(val, 10);
              if (isNaN(num) || num < 100 || num > 599) {
                return 'Status code must be between 100 and 599';
              }
              return true;
            },
          });
          Object.assign(flags, { '--status': parseInt(statusCode, 10) });
          break;
        }
        case 'response-headers': {
          await collectInteractiveHeaders(client, 'response', flags);
          break;
        }
        case 'request-headers': {
          await collectInteractiveHeaders(client, 'request-header', flags);
          break;
        }
        case 'request-query': {
          await collectInteractiveHeaders(client, 'request-query', flags);
          break;
        }
      }

      actionCount++;

      // Remove exclusive actions once one is selected.
      // Non-exclusive actions (headers, query) stay available so the user
      // can add multiple header/query modifications across separate selections.
      const selectedChoice = ALL_ACTION_CHOICES.find(
        c => c.value === actionType
      );
      if (selectedChoice?.exclusive) {
        hasExclusiveAction = true;
        // Remove all exclusive actions from available choices
        const exclusiveValues = ALL_ACTION_CHOICES.filter(c => c.exclusive).map(
          c => c.value
        );
        for (const val of exclusiveValues) {
          const idx = availableActions.findIndex(a => a.value === val);
          if (idx !== -1) availableActions.splice(idx, 1);
        }
      }

      // If no more actions are available, break
      if (availableActions.length === 0) break;
    }

    // --- Description ---
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

    // --- Position ---
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

  // Re-collect after interactive input
  const finalDest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const finalStatus = flags['--status'] as number | undefined;

  // Validate status code range
  if (finalStatus !== undefined && (finalStatus < 100 || finalStatus > 599)) {
    output.error(
      `Status code must be between 100 and 599. Usage: ${getCommandName('routes add "Name" --src "/path" --status 404')}`
    );
    return 1;
  }

  // Validate action combinations
  if (finalDest && finalStatus && REDIRECT_STATUS_CODES.includes(finalStatus)) {
    // This is a redirect - valid
  } else if (finalDest && finalStatus) {
    output.error(
      `Cannot use --dest with status ${finalStatus}. For redirects, use status ${REDIRECT_STATUS_CODES.join(', ')}. Usage: ${getCommandName('routes add "Name" --src "/old" --dest "/new" --status 301')}`
    );
    return 1;
  }

  // Re-collect transforms after interactive input (flags may have been modified)
  try {
    const finalTransformFlags = extractTransformFlags(flags);
    const collected = collectHeadersAndTransforms(finalTransformFlags);
    headers = collected.headers;
    transforms = collected.transforms;
  } catch (e) {
    output.error(
      `Invalid transform format. ${e instanceof Error ? e.message : ''} Usage: ${getCommandName('routes add "Name" --set-response-header "Key=Value"')}`
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

  // Validate max conditions
  const totalConditions = hasConditions.length + missingConditions.length;
  if (totalConditions > MAX_CONDITIONS) {
    output.error(
      `Too many conditions: ${totalConditions}. Maximum is ${MAX_CONDITIONS} conditions (has + missing combined).`
    );
    return 1;
  }

  // --- Collect description ---
  const description: string | undefined = flags['--description'] as
    | string
    | undefined;

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    output.error(
      `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less. Usage: ${getCommandName('routes add "Name" --src "/path" --dest "/dest" --description "Short description"')}`
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
      output.error(
        `${e instanceof Error ? e.message : 'Invalid position'}. Usage: ${getCommandName('routes add "Name" --src "/path" --dest "/dest" --position start')}`
      );
      return 1;
    }
  }

  // --- Build route input ---
  const isRedirect =
    finalDest && finalStatus && REDIRECT_STATUS_CODES.includes(finalStatus);
  const hasResponseHeaders = Object.keys(headers).length > 0;
  const hasTransforms = transforms.length > 0;
  // Check if any transforms modify response headers (append/delete operations)
  const hasResponseHeaderTransforms = transforms.some(
    t => t.type === 'response.headers'
  );

  // Auto-set continue when route modifies response headers and doesn't set a final status.
  const isTerminating = isRedirect || (finalStatus && !finalDest);
  const hasAnyResponseHeaderMutation =
    hasResponseHeaders || hasResponseHeaderTransforms;
  const shouldContinue = hasAnyResponseHeaderMutation && !isTerminating;

  // Track telemetry for conditions and action types
  telemetry.trackCliFlagHasConditions(hasConditions.length > 0);
  telemetry.trackCliFlagMissingConditions(missingConditions.length > 0);
  telemetry.trackCliFlagResponseHeaders(hasResponseHeaders);
  telemetry.trackCliFlagRequestTransforms(hasTransforms);

  // Determine and track the primary action type
  if (isRedirect) {
    telemetry.trackCliActionType('redirect');
  } else if (finalDest) {
    telemetry.trackCliActionType('rewrite');
  } else if (finalStatus) {
    telemetry.trackCliActionType('set-status');
  } else if (hasResponseHeaders || hasTransforms) {
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
      ...(hasResponseHeaders && { headers }),
      ...(hasTransforms && { transforms }),
      ...(hasConditions.length > 0 && { has: hasConditions }),
      ...(missingConditions.length > 0 && { missing: missingConditions }),
      ...(shouldContinue && { continue: true }),
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

    // Display route summary
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

    if (hasResponseHeaders) {
      output.print(
        `  ${chalk.gray('Headers:')} ${Object.keys(headers).length} header(s)\n`
      );
    }

    if (hasTransforms) {
      output.print(
        `  ${chalk.gray('Transforms:')} ${transforms.length} transform(s)\n`
      );
    }

    if (hasConditions.length > 0 || missingConditions.length > 0) {
      output.print(
        `  ${chalk.gray('Conditions:')} ${hasConditions.length} has, ${missingConditions.length} missing\n`
      );
    }

    // Show test URL if available
    if (version.alias) {
      let testPath = '/';
      if (syntax === 'equals') {
        testPath = src;
      } else if (syntax === 'path-to-regexp') {
        // Replace params with example values
        testPath = src.replace(/:\w+\*/g, 'test').replace(/:\w+/g, 'test');
      } else if (src.startsWith('/')) {
        testPath = '/';
      }
      output.print(
        `\n  ${chalk.bold('Test your changes:')} ${chalk.cyan(`https://${version.alias}${testPath}`)}\n`
      );
    }

    output.print(`\n  ${chalk.bold('Staging version:')} ${version.id}\n`);

    // Auto-promote offer
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

/**
 * Interactive condition collection with operator support.
 * Supports equals, contains, matches (regex), and exists operators,
 * matching the frontend's condition-rows.tsx behavior.
 */
async function collectInteractiveConditions(
  client: Client,
  flags: Record<string, unknown>
) {
  let addMore = true;

  while (addMore) {
    // Show current conditions
    const currentHas = (flags['--has'] as string[]) || [];
    const currentMissing = (flags['--missing'] as string[]) || [];

    if (currentHas.length > 0 || currentMissing.length > 0) {
      output.log('\nCurrent conditions:');
      for (const c of currentHas) {
        output.print(`  has: ${c}\n`);
      }
      for (const c of currentMissing) {
        output.print(`  missing: ${c}\n`);
      }
      output.print('\n');
    }

    const conditionType = await client.input.select({
      message: 'Condition type:',
      choices: [
        { name: 'has - Request must have this', value: 'has' },
        { name: 'missing - Request must NOT have this', value: 'missing' },
      ],
    });

    const targetType = await client.input.select({
      message: 'What to check:',
      choices: [
        { name: 'Header', value: 'header' },
        { name: 'Cookie', value: 'cookie' },
        { name: 'Query Parameter', value: 'query' },
        { name: 'Host', value: 'host' },
      ],
    });

    let conditionValue: string;

    if (targetType === 'host') {
      // Host conditions use an operator to build the value pattern
      const operator = await client.input.select({
        message: 'How to match the host:',
        choices: [
          { name: 'Equals', value: 'eq' },
          { name: 'Contains', value: 'contains' },
          { name: 'Matches (regex)', value: 're' },
        ],
      });

      const hostInput = await client.input.text({
        message:
          operator === 're' ? 'Host pattern (regex):' : 'Host value:',
        validate: val => {
          if (!val) return 'Host value is required';
          if (operator === 're') {
            try {
              new RegExp(val);
              return true;
            } catch {
              return 'Invalid regex pattern';
            }
          }
          return true;
        },
      });

      const compiledValue = buildConditionValue(
        operator as ConditionOperator,
        hostInput,
      );
      conditionValue = `host:${compiledValue ?? '.*'}`;
    } else {
      const key = await client.input.text({
        message: `${targetType.charAt(0).toUpperCase() + targetType.slice(1)} name:`,
        validate: val => (val ? true : `${targetType} name is required`),
      });

      const operator = await client.input.select({
        message: 'How to match the value:',
        choices: [
          { name: 'Exists (any value)', value: 'exists' },
          { name: 'Equals', value: 'eq' },
          { name: 'Contains', value: 'contains' },
          { name: 'Matches (regex)', value: 're' },
        ],
      });

      if (operator === 'exists') {
        conditionValue = `${targetType}:${key}`;
      } else {
        const valueInput = await client.input.text({
          message:
            operator === 're' ? 'Value pattern (regex):' : 'Value:',
          validate: val => {
            if (!val) return 'Value is required';
            if (operator === 're') {
              try {
                new RegExp(val);
                return true;
              } catch {
                return 'Invalid regex pattern';
              }
            }
            return true;
          },
        });

        const compiledValue = buildConditionValue(
          operator as ConditionOperator,
          valueInput,
        );
        conditionValue = compiledValue
          ? `${targetType}:${key}:${compiledValue}`
          : `${targetType}:${key}`;
      }
    }

    const flagName = conditionType === 'has' ? '--has' : '--missing';
    const existing = (flags[flagName] as string[]) || [];
    flags[flagName] = [...existing, conditionValue];

    // Check if we've hit the max
    const totalConditions =
      ((flags['--has'] as string[]) || []).length +
      ((flags['--missing'] as string[]) || []).length;

    if (totalConditions >= MAX_CONDITIONS) {
      output.warn(`Maximum ${MAX_CONDITIONS} conditions reached.`);
      break;
    }

    addMore = await client.input.confirm('Add another condition?', false);
  }
}

/**
 * Formats currently collected headers/params for display.
 */
function formatCollectedItems(
  flags: Record<string, unknown>,
  type: 'response' | 'request-header' | 'request-query'
): string[] {
  const items: string[] = [];
  const prefix =
    type === 'response'
      ? 'response-header'
      : type === 'request-header'
        ? 'request-header'
        : 'request-query';

  const setItems = (flags[`--set-${prefix}`] as string[]) || [];
  const appendItems = (flags[`--append-${prefix}`] as string[]) || [];
  const deleteItems = (flags[`--delete-${prefix}`] as string[]) || [];

  for (const item of setItems) {
    items.push(`  set: ${item}`);
  }
  for (const item of appendItems) {
    items.push(`  append: ${item}`);
  }
  for (const item of deleteItems) {
    items.push(`  delete: ${item}`);
  }

  return items;
}

/**
 * Interactive header collection for modify actions.
 */
async function collectInteractiveHeaders(
  client: Client,
  type: 'response' | 'request-header' | 'request-query',
  flags: Record<string, unknown>
) {
  const flagName =
    type === 'response'
      ? '--set-response-header'
      : type === 'request-header'
        ? '--set-request-header'
        : '--set-request-query';

  const sectionName =
    type === 'response'
      ? 'Response Headers'
      : type === 'request-header'
        ? 'Request Headers'
        : 'Request Query Parameters';

  const itemName =
    type === 'response'
      ? 'response header'
      : type === 'request-header'
        ? 'request header'
        : 'query parameter';

  // Show section header
  output.log(`\n--- ${sectionName} ---`);

  let addMore = true;
  while (addMore) {
    // Show current state before prompting
    const collected = formatCollectedItems(flags, type);
    if (collected.length > 0) {
      output.log(`\nCurrent ${sectionName.toLowerCase()}:`);
      for (const item of collected) {
        output.print(`${item}\n`);
      }
      output.print('\n');
    }

    const op = await client.input.select({
      message: `${sectionName} operation:`,
      choices: [
        { name: 'Set', value: 'set' },
        { name: 'Append', value: 'append' },
        { name: 'Delete', value: 'delete' },
      ],
    });

    const key = await client.input.text({
      message: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} name:`,
      validate: val => (val ? true : `${itemName} name is required`),
    });

    if (op === 'delete') {
      const opFlagName = flagName.replace('--set-', '--delete-');
      const existing = (flags[opFlagName] as string[]) || [];
      flags[opFlagName] = [...existing, key];
    } else {
      const value = await client.input.text({
        message: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} value:`,
      });
      const opFlagName =
        op === 'append' ? flagName.replace('--set-', '--append-') : flagName;
      const existing = (flags[opFlagName] as string[]) || [];
      flags[opFlagName] = [...existing, `${key}=${value}`];
    }

    addMore = await client.input.confirm(`Add another ${itemName}?`, false);
  }
}

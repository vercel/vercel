import chalk from 'chalk';
import { pathToRegexp } from 'path-to-regexp';
import type Client from '../../util/client';
import output from '../../output-manager';
import { addSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import addRoute from '../../util/routes/add-route';
import getRouteVersions from '../../util/routes/get-route-versions';
import updateRouteVersion from '../../util/routes/update-route-version';
import { parseConditions } from '../../util/routes/parse-conditions';
import {
  collectTransforms,
  collectResponseHeaders,
} from '../../util/routes/parse-transforms';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import type {
  AddRouteInput,
  HasField,
  Transform,
  PathSyntax,
  RoutePosition,
} from '../../util/routes/types';

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
 * Escapes special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates that a string is a valid regex pattern.
 */
function validateRegex(pattern: string): void {
  try {
    new RegExp(pattern);
  } catch (e) {
    throw new Error(
      `Invalid regex pattern: "${pattern}". ${e instanceof Error ? e.message : ''}`
    );
  }
}

/**
 * Converts a path pattern to regex based on the syntax type.
 */
function convertToRegex(value: string, syntax: PathSyntax): string {
  switch (syntax) {
    case 'exact':
      return `^${escapeRegExp(value)}$`;
    case 'path-to-regexp':
      try {
        return pathToRegexp(value).source;
      } catch (e) {
        throw new Error(
          `Invalid path-to-regexp pattern: "${value}". ${e instanceof Error ? e.message : ''}`
        );
      }
    case 'regex':
    default:
      // Validate regex pattern
      validateRegex(value);
      return value;
  }
}

/**
 * Parses a position string into a RoutePosition object.
 */
function parsePosition(position: string): RoutePosition {
  if (position === 'start') {
    return { placement: 'start' };
  }
  if (position === 'end') {
    return { placement: 'end' };
  }
  if (position.startsWith('after:')) {
    const referenceId = position.slice(6);
    if (!referenceId) {
      throw new Error('Position "after:" requires a route ID');
    }
    return { placement: 'after', referenceId };
  }
  if (position.startsWith('before:')) {
    const referenceId = position.slice(7);
    if (!referenceId) {
      throw new Error('Position "before:" requires a route ID');
    }
    return { placement: 'before', referenceId };
  }
  throw new Error(
    `Invalid position: "${position}". Use: start, end, after:<id>, or before:<id>`
  );
}

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

  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, project.id, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // --- Collect route name ---
  let name: string;
  const nameArg = args[0] === 'add' ? args[1] : args[0];

  if (nameArg) {
    if (nameArg.length > 256) {
      output.error('Route name must be 256 characters or less');
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
        if (val.length > 256) return 'Name must be 256 characters or less';
        return true;
      },
    });
  }

  // --- Collect path pattern ---
  let src: string;
  let syntax: PathSyntax = 'regex';

  if (flags['--syntax']) {
    const syntaxArg = flags['--syntax'] as string;
    if (!['regex', 'path-to-regexp', 'exact'].includes(syntaxArg)) {
      output.error(
        `Invalid syntax: "${syntaxArg}". Valid options: regex, path-to-regexp, exact`
      );
      return 1;
    }
    syntax = syntaxArg as PathSyntax;
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
        { name: 'Exact match (e.g., /about)', value: 'exact' },
        { name: 'Regular expression (e.g., ^/api/(.*)$)', value: 'regex' },
      ],
    });
    syntax = syntaxChoice as PathSyntax;

    const syntaxHelp =
      syntax === 'path-to-regexp'
        ? 'Use :param for parameters, :param* for optional wildcard'
        : syntax === 'exact'
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

  // Convert to regex
  let regexSrc: string;
  try {
    regexSrc = convertToRegex(src, syntax);
  } catch (e) {
    output.error(e instanceof Error ? e.message : 'Invalid path pattern');
    return 1;
  }

  // --- Collect action ---
  const dest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const status = flags['--status'] as number | undefined;

  // Collect transforms from flags
  const transformFlags = {
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

  let transforms: Transform[] = [];
  let headers: Record<string, string> = {};

  try {
    // Collect response headers that use 'set' operation into headers object
    if (transformFlags.setResponseHeader) {
      headers = collectResponseHeaders(transformFlags.setResponseHeader);
    }

    // Collect other transforms
    const otherTransforms = collectTransforms({
      ...transformFlags,
      setResponseHeader: undefined, // Already handled above
    });

    // If we have append/delete for response headers, convert set headers to transforms too
    if (
      transformFlags.appendResponseHeader?.length ||
      transformFlags.deleteResponseHeader?.length
    ) {
      transforms = collectTransforms(transformFlags);
      headers = {};
    } else {
      transforms = otherTransforms;
    }
  } catch (e) {
    output.error(e instanceof Error ? e.message : 'Invalid transform format');
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

  // Interactive mode for action selection
  if (!hasAnyAction && !skipPrompts) {
    const actionType = await client.input.select({
      message: 'What action should this route perform?',
      choices: [
        {
          name: 'Rewrite - Internal redirect to different URL',
          value: 'rewrite',
        },
        {
          name: 'Redirect - Browser redirect (301, 302, 307, 308)',
          value: 'redirect',
        },
        {
          name: 'Set Status Code - Return HTTP status without proxying',
          value: 'set-status',
        },
        { name: 'Modify Response Headers', value: 'response-headers' },
        { name: 'Modify Request Headers', value: 'request-headers' },
        { name: 'Modify Request Query', value: 'request-query' },
      ],
    });

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
            { name: '307 - Temporary Redirect (preserves method)', value: 307 },
            { name: '308 - Permanent Redirect (preserves method)', value: 308 },
            { name: '301 - Moved Permanently (may change to GET)', value: 301 },
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
  }

  // Re-collect after interactive input
  const finalDest = flags['--dest']
    ? stripQuotes(flags['--dest'] as string)
    : undefined;
  const finalStatus = flags['--status'] as number | undefined;

  // Validate status code range
  if (finalStatus !== undefined && (finalStatus < 100 || finalStatus > 599)) {
    output.error('Status code must be between 100 and 599');
    return 1;
  }

  // Validate action combinations
  if (finalDest && finalStatus && REDIRECT_STATUS_CODES.includes(finalStatus)) {
    // This is a redirect - valid
  } else if (finalDest && finalStatus) {
    output.error(
      `Cannot use --dest with status ${finalStatus}. For redirects, use status 301, 302, 307, or 308.`
    );
    return 1;
  }

  // Re-collect transforms after interactive input
  const finalTransformFlags = {
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

  try {
    if (finalTransformFlags.setResponseHeader) {
      headers = collectResponseHeaders(finalTransformFlags.setResponseHeader);
    }
    transforms = collectTransforms({
      ...finalTransformFlags,
      setResponseHeader: undefined,
    });
  } catch (e) {
    output.error(e instanceof Error ? e.message : 'Invalid transform format');
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

  // Validate max conditions (16 total)
  const totalConditions = hasConditions.length + missingConditions.length;
  if (totalConditions > 16) {
    output.error(
      `Too many conditions: ${totalConditions}. Maximum is 16 conditions (has + missing combined).`
    );
    return 1;
  }

  // --- Collect description ---
  const description: string | undefined = flags['--description'] as
    | string
    | undefined;

  if (description && description.length > 1024) {
    output.error('Description must be 1024 characters or less');
    return 1;
  }

  // --- Collect position ---
  let position: RoutePosition | undefined;
  const positionFlag = flags['--position'] as string | undefined;

  if (positionFlag) {
    try {
      position = parsePosition(positionFlag);
    } catch (e) {
      output.error(e instanceof Error ? e.message : 'Invalid position');
      return 1;
    }
  }

  // --- Build route input ---
  const isRedirect =
    finalDest && finalStatus && REDIRECT_STATUS_CODES.includes(finalStatus);
  const hasResponseHeaders = Object.keys(headers).length > 0;
  const hasTransforms = transforms.length > 0;

  // Auto-set continue when we have response headers but no rewrite/redirect
  const shouldContinue = hasResponseHeaders && !finalDest;

  const routeInput: AddRouteInput = {
    name,
    description,
    enabled: !flags['--disabled'],
    route: {
      src: regexSrc,
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
      // For exact and path-to-regexp patterns, use the original src
      // For regex, try to extract a simple testable path or default to /
      let testPath = '/';
      if (syntax === 'exact') {
        testPath = src;
      } else if (syntax === 'path-to-regexp') {
        // Replace params with example values
        testPath = src.replace(/:\w+\*/g, 'test').replace(/:\w+/g, 'test');
      } else if (src.startsWith('/')) {
        // For regex, use root path (extracting from regex is unreliable)
        testPath = '/';
      }
      output.print(
        `\n  ${chalk.bold('Test your changes:')} ${chalk.cyan(`https://${version.alias}${testPath}`)}\n`
      );
    }

    output.print(`\n  ${chalk.bold('Staging version:')} ${version.id}\n`);

    // Auto-promote logic
    if (!existingStagingVersion && !skipPrompts) {
      output.print('\n');
      const shouldPromote = await client.input.confirm(
        'This is the only staged change. Promote to production now?',
        false
      );

      if (shouldPromote) {
        const promoteStamp = stamp();
        output.spinner('Promoting to production');

        await updateRouteVersion(client, project.id, version.id, 'promote', {
          teamId,
        });

        output.log(
          `${chalk.cyan('Promoted')} to production ${chalk.gray(promoteStamp())}`
        );
      }
    } else if (existingStagingVersion) {
      output.warn(
        `There are other staged changes. Review with ${chalk.cyan(getCommandName('routes list --staging'))} before promoting.`
      );
    }

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

  const itemName =
    type === 'response'
      ? 'header'
      : type === 'request-header'
        ? 'header'
        : 'parameter';

  let addMore = true;
  while (addMore) {
    const op = await client.input.select({
      message: 'Operation:',
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

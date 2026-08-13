import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import {
  getCustomEnvironments,
  pickCustomEnvironment,
} from '../../util/target/get-custom-environments';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { ProjectDomainsUpdateTelemetryClient } from '../../util/telemetry/commands/project/domains-update';
import { domainsUpdateSubcommand } from './command';

const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const;

interface ProjectDomainResponse {
  name: string;
  projectId?: string;
  gitBranch?: string | null;
  redirect?: string | null;
  redirectStatusCode?: number | null;
  customEnvironmentId?: string | null;
}

interface DomainPatchBody extends JSONObject {
  gitBranch: string | null;
  redirect: string | null;
  redirectStatusCode: number | null;
  customEnvironmentId?: string;
}

function usageError(message: string, exitCode: number): number {
  output.error(
    `${message} Usage: ${getCommandName(
      'project domains update <domain> [project]'
    )}`
  );
  return exitCode;
}

/** Empty string clears a value; any other provided string sets it. */
function resolveStringField(
  flag: string | undefined,
  current: string | null | undefined
): string | null {
  if (flag === undefined) {
    return current ?? null;
  }
  return flag === '' ? null : flag;
}

export async function domainsUpdate(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectDomainsUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(domainsUpdateSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const domain = args[0];
  const projectNameOrId = args[1];

  const gitBranchFlag = flags['--git-branch'];
  const environmentFlag = flags['--environment'];
  const redirectFlag = flags['--redirect'];
  const redirectStatusFlag = flags['--redirect-status'];

  telemetry.trackCliArgumentDomain(domain);
  telemetry.trackCliOptionGitBranch(gitBranchFlag);
  telemetry.trackCliOptionEnvironment(environmentFlag);
  telemetry.trackCliOptionRedirect(redirectFlag);
  telemetry.trackCliOptionRedirectStatus(redirectStatusFlag);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (!domain) {
    return usageError('Missing required domain argument.', 2);
  }

  if (args.length > 2) {
    return usageError('Too many arguments.', 2);
  }

  const provided =
    gitBranchFlag !== undefined ||
    environmentFlag !== undefined ||
    redirectFlag !== undefined ||
    redirectStatusFlag !== undefined;
  if (!provided) {
    return usageError(
      'Provide at least one setting option: --git-branch, --environment, --redirect, or --redirect-status.',
      2
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  // Validate the redirect status locally before any remote work.
  let redirectStatusCodeInput: number | null | undefined;
  if (redirectStatusFlag !== undefined) {
    if (redirectStatusFlag === '') {
      redirectStatusCodeInput = null;
    } else {
      const parsed = Number(redirectStatusFlag);
      if (
        !Number.isInteger(parsed) ||
        !REDIRECT_STATUS_CODES.includes(
          parsed as (typeof REDIRECT_STATUS_CODES)[number]
        )
      ) {
        return usageError(
          `Invalid --redirect-status "${redirectStatusFlag}". Use one of: ${REDIRECT_STATUS_CODES.join(
            ', '
          )}.`,
          2
        );
      }
      redirectStatusCodeInput = parsed;
    }
  }

  // A domain cannot have both a git branch and a redirect; reject the
  // explicit flag conflict locally before any remote work.
  if (gitBranchFlag && redirectFlag) {
    return usageError(
      `Cannot set both a git branch and a redirect for the domain "${domain}".`,
      2
    );
  }

  let project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project domains update',
      projectNameOrId,
      forReadOnlyCommand: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const domainPath = `/v9/projects/${encodeURIComponent(
    project.id
  )}/domains/${encodeURIComponent(domain)}`;

  // The public PATCH endpoint replaces all fields (unset -> null), so read the
  // current config first and merge the provided flags over it. This keeps
  // untouched settings intact and matches the dashboard edit flow.
  let current: ProjectDomainResponse;
  try {
    current = await client.fetch<ProjectDomainResponse>(domainPath);
  } catch (error) {
    if (isAPIError(error) && error.status === 404) {
      output.error(
        `Domain "${domain}" was not found on project "${project.name}".`
      );
      return 1;
    }
    printError(error);
    return 1;
  }

  // Resolve --environment (id or slug) to a custom environment id.
  let customEnvironmentId: string | undefined;
  if (environmentFlag === undefined) {
    customEnvironmentId = current.customEnvironmentId ?? undefined;
  } else if (environmentFlag !== '') {
    const environments = await getCustomEnvironments(client, project.id);
    const match = pickCustomEnvironment(environments, environmentFlag);
    if (!match) {
      const available = environments.map(env => env.slug).join(', ');
      output.error(
        `Custom environment "${environmentFlag}" was not found on project "${project.name}".${
          available ? ` Available: ${available}.` : ''
        }`
      );
      return 1;
    }
    customEnvironmentId = match.id;
  }

  const gitBranch = resolveStringField(gitBranchFlag, current.gitBranch);
  const redirect = resolveStringField(redirectFlag, current.redirect);
  // A cleared redirect cannot keep a status code, so clear both together.
  const redirectStatusCode =
    redirect === null
      ? null
      : redirectStatusCodeInput === undefined
        ? (current.redirectStatusCode ?? null)
        : redirectStatusCodeInput;

  // Merge-derived conflict: the provided flag collides with a value already
  // set on the domain.
  if (gitBranch && redirect) {
    output.error(
      `Cannot set both a git branch and a redirect for the domain "${domain}". Clear the other setting with --git-branch "" or --redirect "".`
    );
    return 1;
  }

  const body: DomainPatchBody = {
    gitBranch,
    redirect,
    redirectStatusCode,
  };
  // customEnvironmentId is a non-nullable string in the API schema: send it to
  // preserve/set, omit it to clear (the endpoint treats absence as null).
  if (customEnvironmentId) {
    body.customEnvironmentId = customEnvironmentId;
  }

  let updated: ProjectDomainResponse;
  try {
    updated = await client.fetch<ProjectDomainResponse>(domainPath, {
      method: 'PATCH',
      body,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const result = {
    updated: true,
    projectId: project.id,
    projectName: project.name,
    domain,
    gitBranch: updated.gitBranch ?? null,
    redirect: updated.redirect ?? null,
    redirectStatusCode: updated.redirectStatusCode ?? null,
    customEnvironmentId: updated.customEnvironmentId ?? null,
  };

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  printAlignedLabel('Updated', 'Project Domain', { gutter: '✓' });
  printAlignedLabel('Project', project.name);
  printAlignedLabel('Domain', domain);
  if (gitBranchFlag !== undefined) {
    printAlignedLabel(
      'Git Branch',
      formatChange(current.gitBranch, result.gitBranch)
    );
  }
  if (redirectFlag !== undefined || redirectStatusFlag !== undefined) {
    printAlignedLabel(
      'Redirect',
      formatChange(
        formatRedirect(current.redirect, current.redirectStatusCode),
        formatRedirect(result.redirect, result.redirectStatusCode)
      )
    );
  }
  if (environmentFlag !== undefined) {
    printAlignedLabel(
      'Environment',
      formatChange(current.customEnvironmentId, result.customEnvironmentId)
    );
  }
  return 0;
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'None';
  }
  return String(value);
}

function formatRedirect(
  redirect: string | null | undefined,
  statusCode: number | null | undefined
): string | null {
  if (!redirect) {
    return null;
  }
  return statusCode ? `${redirect} (${statusCode})` : redirect;
}

function formatChange(
  previous: string | number | null | undefined,
  next: string | number | null | undefined
): string {
  const prev = formatValue(previous);
  const nextValue = formatValue(next);
  return prev === nextValue ? nextValue : `${prev} → ${nextValue}`;
}

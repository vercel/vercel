import { domainToASCII } from 'url';
import { isIP } from 'net';
import type Client from '../../util/client';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { isAPIError } from '../../util/errors-ts';
import {
  getProjectDomain,
  type ProjectDomain,
} from '../../util/projects/get-project-domain';
import {
  outputAgentError,
  outputAgentSuccess,
  withGlobalFlags,
} from '../../util/agent-output';
import { printAlignedLabel } from '../../util/output/print-aligned-label';

function normalizeDomain(value: string): string | undefined {
  if (!/^[\p{L}\p{M}\p{N}.-]+$/u.test(value)) return;
  const domain = domainToASCII(value).toLowerCase();
  if (
    !isIP(domain) &&
    domain.length <= 253 &&
    domain.includes('.') &&
    domain
      .split('.')
      .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return domain;
}

export async function addDomainRedirect(
  client: Client,
  args: string[],
  redirectInput: string | undefined,
  statusInput: string | undefined,
  force: boolean | undefined
): Promise<number> {
  function fail(reason: string, message: string) {
    output.stopSpinner();
    if (client.nonInteractive) {
      outputAgentError(client, { status: 'error', reason, message }, 1);
      return 1;
    }
    output.fatal(message);
    return 1;
  }

  if (args.length !== 2 || !redirectInput) {
    return fail(
      'invalid_arguments',
      'Provide a domain, project, and --redirect <domain>. Usage: vercel domains add <domain> <project> --redirect <domain>.'
    );
  }
  if (force) {
    return fail(
      'invalid_arguments',
      'The --force and --redirect flags cannot be combined. Move the domain to the project first, then configure its redirect.'
    );
  }
  const domain = normalizeDomain(args[0]);
  const redirect = normalizeDomain(redirectInput);
  const project = args[1];
  if (!domain || !redirect) {
    return fail(
      'invalid_domain',
      'Provide domain names without a protocol, path, port, wildcard, or query string.'
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(project)) {
    return fail(
      'invalid_project',
      'Provide a project name or ID without a path or query string.'
    );
  }
  if (domain === redirect) {
    return fail('invalid_redirect', 'A domain cannot redirect to itself.');
  }
  const statusCode = Number(statusInput ?? '307');
  if (!['301', '302', '307', '308'].includes(statusInput ?? '307')) {
    return fail(
      'invalid_arguments',
      'The --redirect-status-code value must be 301, 302, 307, or 308.'
    );
  }

  try {
    const { contextName } = await getScope(client, { resolveLocalScope: true });
    output.spinner(
      `Configuring ${domain} → ${redirect} on ${contextName}/${project}`
    );
    const target = await getProjectDomain(client, project, redirect, {
      bailOn429: true,
    });
    if (target instanceof Error) {
      if (isAPIError(target) && target.status === 404) {
        return fail(
          'redirect_target_not_found',
          'The redirect destination must already be added to the selected project. Add it first with vercel domains add <destination> <project>.'
        );
      }
      throw target;
    }
    if (target.redirect) {
      return fail(
        'redirect_chain',
        'The destination already redirects to another domain. Redirect chains are not supported.'
      );
    }
    const current = await getProjectDomain(client, project, domain, {
      bailOn429: true,
    });
    if (
      current instanceof Error &&
      !(isAPIError(current) && current.status === 404)
    )
      throw current;
    const existing = current instanceof Error ? undefined : current;
    if (existing?.gitBranch) {
      return fail(
        'redirect_branch_domain_conflict',
        'This domain is assigned to a Preview branch. Remove its branch assignment in project settings before configuring a redirect.'
      );
    }
    let result: ProjectDomain;
    const unchanged =
      existing?.redirect === redirect &&
      existing.redirectStatusCode === statusCode;
    if (unchanged) {
      result = existing;
    } else {
      const path = `/v${existing ? 9 : 10}/projects/${encodeURIComponent(project)}/domains`;
      result = await client.fetch<ProjectDomain>(
        existing ? `${path}/${encodeURIComponent(domain)}` : path,
        {
          method: existing ? 'PATCH' : 'POST',
          // PATCH clears omitted assignment fields, so retain the existing environment.
          body: {
            ...(existing
              ? {
                  gitBranch: null,
                  ...(existing.customEnvironmentId
                    ? { customEnvironmentId: existing.customEnvironmentId }
                    : {}),
                }
              : { name: domain }),
            redirect,
            redirectStatusCode: statusCode,
          },
          retry: { retries: 0 },
          bailOn429: true,
        }
      );
    }
    output.stopSpinner();
    if (
      result.name !== domain ||
      result.redirect !== redirect ||
      result.redirectStatusCode !== statusCode
    ) {
      return fail(
        'unexpected_response',
        'The API did not confirm the requested redirect. Inspect the domain before retrying.'
      );
    }
    const message =
      (unchanged
        ? `Redirect ${domain} → ${redirect} (${statusCode}) is already configured on project ${project}.`
        : `Configured ${domain} → ${redirect} (${statusCode}) on project ${project}.`) +
      (result.verified === false
        ? ' Domain ownership verification is still required.'
        : '');
    const verify = withGlobalFlags(
      client,
      `domains verify ${domain} --project ${project}`
    );
    if (client.nonInteractive) {
      outputAgentSuccess(
        client,
        {
          status: 'success',
          reason: unchanged
            ? 'redirect_already_configured'
            : 'redirect_configured',
          message,
          next: [
            {
              command: verify,
              when: 'to check ownership verification and DNS configuration',
            },
          ],
        },
        0
      );
      return 0;
    }
    if (unchanged) {
      output.log(message);
    } else {
      printAlignedLabel(
        'Configured',
        `${domain} → ${redirect} (${statusCode})`,
        { gutter: '✓' }
      );
      if (result.verified === false)
        output.warn('Domain ownership verification is still required.');
    }
    printAlignedLabel('Project', `${contextName}/${project}`);
    output.log(`Check DNS and ownership verification with ${verify}.`);
    return 0;
  } catch (error) {
    return fail(
      isAPIError(error) ? error.code : 'redirect_failed',
      error instanceof Error
        ? error.message
        : 'Failed to configure the redirect.'
    );
  }
}

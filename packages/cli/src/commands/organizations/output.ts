import type Client from '../../util/client';
import { shouldEmitNonInteractiveCommandError } from '../../util/agent-output';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import type { Organization } from '../../util/organizations/api';
import output from '../../output-manager';

/**
 * A JSON result keyed by resource noun, such as `{ "organization": { … } }`
 * or `{ "teams": [ … ], "pagination": { "next": null } }`. A mutation adds
 * `outcome`. The CLI design system defines these shapes.
 */
export type JsonResult = Record<string, unknown>;

/**
 * Writes the result of an organization subcommand: the JSON document with
 * `--json`, and the human view otherwise. A non-interactive run without
 * `--json` gets the human view, because format and interaction are separate
 * settings.
 */
export function printResult(
  client: Client,
  jsonOutput: boolean,
  document: JsonResult,
  human: () => void
): void {
  output.stopSpinner();
  if (jsonOutput) {
    client.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return;
  }
  human();
}

/**
 * Writes the identifier of a changed resource to stdout, so that
 * `slug=$(vercel organizations create …)` works. An interactive terminal
 * already shows it in the receipt.
 */
export function printStdoutIdentifier(
  client: Client,
  identifier: string
): void {
  if (client.stdout.isTTY && !shouldEmitNonInteractiveCommandError(client)) {
    return;
  }
  client.stdout.write(`${identifier}\n`);
}

/**
 * Writes an organization. A receipt (`action` set) goes to stderr, because the
 * stdout identifier is the answer of a mutation. The detail view of `inspect`
 * is the answer, so it goes to stdout.
 */
export function printOrganization(
  client: Client,
  organization: Organization,
  options: {
    /** The receipt verb, such as `Created`. Absent for the detail view. */
    action?: string;
    /** Root team slug, when a lookup resolved it. Falls back to the ID. */
    rootTeamSlug?: string;
  } = {}
): void {
  const { action, rootTeamSlug } = options;
  const rows = [
    action
      ? formatAlignedLabel(action, organization.slug, { gutter: '✓' })
      : formatAlignedLabel('Organization', organization.slug),
    formatAlignedLabel('Organization ID', organization.organizationId),
  ];

  if (organization.name) {
    rows.push(formatAlignedLabel('Name', organization.name));
  }

  const rootTeam = rootTeamSlug
    ? `${rootTeamSlug} (${organization.teamId})`
    : organization.teamId;
  rows.push(
    formatAlignedLabel('Root Team', rootTeam),
    formatAlignedLabel('Teams', String(organization.teamCount))
  );

  if (action) {
    rows.forEach(row => output.print(`${row}\n`));
    return;
  }

  rows.push(
    formatAlignedLabel('Created', organization.createdAt),
    formatAlignedLabel('Updated', organization.updatedAt)
  );
  client.stdout.write(`${rows.join('\n')}\n`);
}

export function progress(jsonOutput: boolean, message: string): void {
  if (!jsonOutput) output.spinner(message);
}

import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { AGENT_REASON } from '../../util/agent-output-constants';
import cmd from '../../util/output/cmd';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { scaleSubcommand } from './command';
import * as api from './api';

const USAGE = 'scale <daemon> <REGION=NUMBER>...';

/** Validates `REGION=NUMBER` overrides; returns an error message on failure. */
function parseOverrides(values: string[]): Record<string, number> | string {
  const overrides: Record<string, number> = {};
  for (const value of values) {
    const [, region, count] = /^([a-z]{3}[0-9])=([0-9]+)$/.exec(value) ?? [];
    if (!region) return `Invalid override "${value}". Use REGION=NUMBER.`;
    if (Number(count) > 100)
      return `Invalid override "${value}". The maximum is 100.`;
    if (region in overrides) return `Region ${region} is set more than once.`;
    overrides[region] = Number(count);
  }
  return overrides;
}

export default async function scale(client: Client, argv: string[]) {
  const parsed = api.parse(client, argv, scaleSubcommand.options, USAGE);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, asJson, telemetry } = parsed;
  const [daemonName, ...overrideArgs] = args;
  telemetry.trackCliArgumentDaemon(daemonName);
  telemetry.trackCliArgumentOverrides(overrideArgs);
  if (!daemonName || !api.DAEMON_NAME_PATTERN.test(daemonName)) {
    return api.usageError(client, 'Expected a valid daemon name.', USAGE);
  }
  if (Boolean(flags['--reset']) === overrideArgs.length > 0) {
    const message = 'Expected REGION=NUMBER overrides or --reset, not both.';
    return api.usageError(client, message, USAGE);
  }
  const overrides = parseOverrides(overrideArgs);
  if (typeof overrides === 'string') {
    return api.usageError(client, overrides, USAGE);
  }

  const link = await api.resolveProject(client, flags['--project']);
  if (typeof link === 'number') return link;
  const next = api.daemonsCommand(client, `instances list ${daemonName}`);

  try {
    if (!asJson) output.spinner(`Scaling daemon ${daemonName}`);
    // The overrides are stored when this returns; instances follow later.
    await client.fetch(
      `${api.daemonsPath(link.project, daemonName, 'instances')}?target=production`,
      { method: 'PUT', accountId: link.project.accountId, body: overrides }
    );
    output.stopSpinner();
    if (asJson) {
      const daemon = { name: daemonName, overrides };
      return api.printJson(client, {
        daemon,
        outcome: 'scaled',
        next: [{ command: next }],
      });
    }
    const counts = Object.entries(overrides).map(([r, n]) => `${r}=${n}`);
    printAlignedLabel('Scaled', daemonName, { gutter: '✓' });
    printAlignedLabel('Project', link.target);
    printAlignedLabel('Overrides', counts.join(', ') || 'None');
    output.print(
      `\n  Instances change in the background. Check them:\n    ${cmd(next)}\n`
    );
    if (!client.stdout.isTTY) client.stdout.write(`${daemonName}\n`);
    return 0;
  } catch (err) {
    if (isAPIError(err) && err.status === 404) {
      return api.failure(
        client,
        AGENT_REASON.NOT_FOUND,
        `Couldn't find production daemon ${daemonName} in ${link.target}.`,
        { command: 'list', when: 'See the daemons' }
      );
    }
    output.stopSpinner();
    return api.reportError(client, err);
  }
}

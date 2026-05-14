import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';
import { validateHexColor } from '../../util/connex/validate-hex';
import {
  prepareConnexIcon,
  uploadConnexIcon,
  type PreparedIcon,
} from '../../util/connex/upload-icon';
import type { ConnexClient } from './types';

export async function update(
  client: Client,
  args: string[],
  flags: {
    '--icon'?: string;
    '--background-color'?: string;
    '--accent-color'?: string;
    '--format'?: string;
    '--json'?: boolean;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const clientIdOrUid = args[0];
  if (!clientIdOrUid) {
    output.error(
      'Missing connector ID or UID. Usage: vercel connect update <id>'
    );
    return 1;
  }

  const iconFlag = flags['--icon'];
  const backgroundColor = flags['--background-color'];
  const accentColor = flags['--accent-color'];

  // Preflight validation BEFORE team selection / network / upload.
  // This includes hex format, at-least-one, icon path readability AND
  // magic-byte check — we don't want to mutate team config just to fail
  // on an unreadable or non-image icon afterwards.
  if (iconFlag !== undefined && iconFlag.length === 0) {
    output.error('Icon path cannot be empty.');
    return 1;
  }
  try {
    validateHexColor(backgroundColor, 'background color');
    validateHexColor(accentColor, 'accent color');
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  if (
    iconFlag === undefined &&
    backgroundColor === undefined &&
    accentColor === undefined
  ) {
    output.error(
      'Specify at least one of: --icon, --background-color, --accent-color.'
    );
    return 1;
  }
  let preparedIcon: PreparedIcon | undefined;
  if (iconFlag) {
    try {
      preparedIcon = await prepareConnexIcon(iconFlag);
    } catch (err) {
      output.error((err as Error).message);
      return 1;
    }
  }

  await selectConnexTeam(client, 'Select the team for this connector');

  // Upload the prepared icon (if any) before sending the PATCH. The file
  // was already validated above; this only does the /v2/files POST.
  let iconSha: string | undefined;
  if (preparedIcon) {
    try {
      output.spinner('Uploading icon...');
      iconSha = await uploadConnexIcon(client, preparedIcon);
    } catch (err) {
      output.stopSpinner();
      output.error((err as Error).message);
      return 1;
    }
    output.stopSpinner();
  }

  const body: JSONObject = {};
  if (iconSha) {
    body.icon = iconSha;
  }
  if (backgroundColor) {
    body.backgroundColor = backgroundColor;
  }
  if (accentColor) {
    body.accentColor = accentColor;
  }

  let updated: ConnexClient;
  try {
    output.spinner('Updating connector...');
    updated = await client.fetch<ConnexClient>(
      `/v1/connect/connectors/${encodeURIComponent(clientIdOrUid)}`,
      { method: 'PATCH', body }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(`Connector not found: ${chalk.bold(clientIdOrUid)}`);
      return 1;
    }
    output.error(
      `Failed to update ${chalk.bold(clientIdOrUid)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          id: updated.id,
          uid: updated.uid,
          type: updated.type,
          name: updated.name,
          icon: updated.icon ?? null,
          backgroundColor: updated.backgroundColor ?? null,
          accentColor: updated.accentColor ?? null,
        },
        null,
        2
      )}\n`
    );
  } else {
    const displayName = updated.uid || updated.id;
    output.success(`Connector ${chalk.bold(displayName)} updated.`);
  }
  return 0;
}

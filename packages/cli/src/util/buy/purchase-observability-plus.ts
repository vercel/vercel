import { errorToString } from '@vercel/error-utils';
import type Client from '../client';
import output from '../../output-manager';
import { getTeamBillingUrl } from '../billing-url';
import { isAPIError } from '../errors-ts';
import getScope from '../get-scope';
import { printAlignedLabel } from '../output/print-aligned-label';
import { getCommandName } from '../pkg-name';

const OBSERVABILITY_PLUS_PRODUCT_ALIAS = 'observabilityPlus';

type ObservabilityConfigurationResponse = {
  teamEnabled: boolean;
};

type ObservabilityConfiguration = {
  observabilityPlus: {
    enabled: boolean;
    subscribed: boolean;
  };
};

export type PurchaseObservabilityPlusOptions = {
  yes: boolean;
  asJson: boolean;
};

export async function purchaseObservabilityPlus(
  client: Client,
  { yes, asJson }: PurchaseObservabilityPlusOptions
): Promise<number> {
  const { team, contextName } = await getScope(client);

  if (!team) {
    output.error(
      'Observability Plus requires a team. Use --scope to specify one.'
    );
    return 1;
  }

  if (team.billing?.plan === 'hobby') {
    output.error(
      'Observability Plus requires an active Pro or Enterprise plan.'
    );
    output.log(`Upgrade with ${getCommandName('buy pro')}.`);
    return 1;
  }

  let currentConfiguration: ObservabilityConfiguration;
  if (!asJson) {
    output.spinner('Checking Observability Plus status');
  }
  try {
    currentConfiguration = await client.fetch<ObservabilityConfiguration>(
      '/v1/observability/manage/configuration'
    );
  } catch (err: unknown) {
    output.stopSpinner();
    output.error('Failed to check Observability Plus status.');
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }
  output.stopSpinner();

  if (currentConfiguration.observabilityPlus.subscribed) {
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            productAlias: OBSERVABILITY_PLUS_PRODUCT_ALIAS,
            quantity: 1,
            team: contextName,
            teamEnabled: currentConfiguration.observabilityPlus.enabled,
          },
          null,
          2
        )}\n`
      );
    } else {
      printAlignedLabel('Status', 'Already enabled');
      printAlignedLabel('Team', contextName);
    }
    return 0;
  }

  if (!yes && (!client.stdin.isTTY || client.nonInteractive)) {
    output.error(
      'Confirmation required. Use --yes to skip the confirmation prompt in non-interactive mode.'
    );
    return 1;
  }

  if (!asJson || !yes) {
    printAlignedLabel('Add-on', 'Observability Plus');
    printAlignedLabel('Team', contextName);
    printAlignedLabel('Usage', 'Billed as accrued');
  }

  if (!yes && !(await client.input.confirm('Enable this add-on?', false))) {
    return 0;
  }

  if (!asJson) {
    output.spinner('Enabling Observability Plus');
  }

  try {
    const result = await client.fetch<ObservabilityConfigurationResponse>(
      '/v1/observability/manage/configuration',
      {
        method: 'PATCH',
        body: { teamEnabled: true },
      }
    );

    output.stopSpinner();

    if (!result.teamEnabled) {
      output.error(
        'The API did not confirm Observability Plus access for this team. Check the team billing settings before retrying.'
      );
      return 1;
    }

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            productAlias: OBSERVABILITY_PLUS_PRODUCT_ALIAS,
            quantity: 1,
            team: contextName,
            teamEnabled: result.teamEnabled,
          },
          null,
          2
        )}\n`
      );
    } else {
      printAlignedLabel('Enabled', 'Observability Plus', { gutter: '✓' });
      printAlignedLabel('Team', contextName);
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    return handleObservabilityPlusPurchaseError(err, contextName);
  }
}

function handleObservabilityPlusPurchaseError(
  err: unknown,
  teamSlug: string
): number {
  if (isAPIError(err)) {
    if (err.code === 'forbidden') {
      output.error(
        'Only team owners can purchase Observability Plus. Ask a team owner.'
      );
      return 1;
    }
    if (err.code === 'invalid_plan_status') {
      output.error(
        "Observability Plus can't be enabled while this team's subscription is in its current state."
      );
      output.log(
        `Review the team billing settings: ${output.link(getTeamBillingUrl(teamSlug), getTeamBillingUrl(teamSlug))}`
      );
      return 1;
    }
    if (err.code === 'invalid_product' || err.code === 'invalid_price') {
      output.error(
        "Observability Plus isn't available for this team's current plan."
      );
      output.log(
        `Review the team billing settings: ${output.link(getTeamBillingUrl(teamSlug), getTeamBillingUrl(teamSlug))}`
      );
      return 1;
    }
  }

  output.error('Failed to enable Observability Plus.');
  output.debug(`Server response: ${errorToString(err)}`);
  return 1;
}

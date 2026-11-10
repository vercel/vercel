import type Client from '../../util/client';
import { addAutoProvision } from './add-auto-provision';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import { getTypedOptionName } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import {
  getRenamedOption,
  reportRenamedOptionError,
} from '../../util/renamed-option';

import { addSubcommand, type IntegrationAddFlags } from './command';

export async function add(
  client: Client,
  args: string[],
  flags: IntegrationAddFlags,
  commandName?: 'integration add' | 'install'
) {
  const resourceNameArg = flags['--name'];
  const prefix = flags['--prefix'];
  if (prefix !== undefined && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(prefix)) {
    output.error(
      'Invalid --prefix value. It must start with a letter and contain only letters, digits, and underscores.'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const argv = client.argv.slice(2);
  const spec = getFlagsSpecification(addSubcommand.options);
  const meta = getRenamedOption<string[]>(flags, '--meta', '--metadata', {
    json: asJson,
    typedName: getTypedOptionName(argv, spec, '--metadata'),
  });
  if ('error' in meta) {
    return reportRenamedOptionError(client, meta.error, { json: asJson });
  }
  const billingPlan = getRenamedOption(flags, '--billing-plan', '--plan', {
    json: asJson,
    typedName: getTypedOptionName(argv, spec, '--plan'),
  });
  if ('error' in billingPlan) {
    return reportRenamedOptionError(client, billingPlan.error, {
      json: asJson,
    });
  }
  const installation = getRenamedOption(
    flags,
    '--installation',
    '--installation-id',
    { json: asJson }
  );
  if ('error' in installation) {
    return reportRenamedOptionError(client, installation.error, {
      json: asJson,
    });
  }
  const metadataFlags = meta.value;
  const billingPlanId = billingPlan.value;
  const installationId = installation.value;

  if (args.length > 1) {
    output.error('Cannot install more than one integration at a time');
    return 2;
  }

  const rawArg = args[0];

  if (!rawArg) {
    const message = 'You must pass an integration slug';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message,
        hint: `Example: \`${packageName} integration add <integration-slug>\`. Run \`${packageName} integration discover\` to find slugs.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration discover',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'List available marketplace integrations and slugs',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration add neon',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Install after replacing neon with a slug from discover',
          },
        ],
      },
      2
    );
    output.error(message);
    return 2;
  }

  // Parse optional product slug from "integration/product" syntax
  let integrationSlug: string;
  let productSlug: string | undefined;
  const slashIndex = rawArg.indexOf('/');
  if (slashIndex !== -1) {
    integrationSlug = rawArg.substring(0, slashIndex);
    productSlug = rawArg.substring(slashIndex + 1);
    if (!integrationSlug || !productSlug) {
      output.error(
        'Invalid format. Expected: <integration-name>/<product-slug>'
      );
      return 2;
    }
  } else {
    integrationSlug = rawArg;
  }

  const environments = flags['--environment'];

  const claimFlag = flags['--claim'];
  const noClaimFlag = flags['--no-claim'];
  if (claimFlag && noClaimFlag) {
    output.error('Cannot use both --claim and --no-claim.');
    return 2;
  }

  return await addAutoProvision(client, integrationSlug, resourceNameArg, {
    productSlug,
    metadata: metadataFlags,
    billingPlanId,
    installationId,
    noConnect: flags['--no-connect'],
    noEnvPull: flags['--no-env-pull'],
    environments,
    prefix,
    commandName,
    asJson,
    claim: claimFlag,
    noClaim: noClaimFlag,
    flags,
    deprecations: [meta.warning, billingPlan.warning, installation.warning],
  });
}

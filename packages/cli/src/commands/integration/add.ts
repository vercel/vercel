import type Client from '../../util/client';
import {
  VALID_ENVIRONMENTS,
  validateEnvironments,
} from '../../util/integration/post-provision-setup';
import { addAutoProvision } from './add-auto-provision';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';

import type { IntegrationAddFlags } from './command';

export async function add(
  client: Client,
  args: string[],
  flags: IntegrationAddFlags,
  commandName?: 'integration add' | 'install'
) {
  const resourceNameArg = flags['--name'];
  const metadataFlags = flags['--metadata'];
  const billingPlanId = flags['--plan'];
  const prefix = flags['--prefix'];
  if (prefix !== undefined && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(prefix)) {
    output.error(
      'Invalid --prefix value. It must start with a letter and contain only letters, digits, and underscores.'
    );
    return 1;
  }
  const installationId = flags['--installation-id'];

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (args.length > 1) {
    output.error('Cannot install more than one integration at a time');
    return 1;
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
      1
    );
    output.error(message);
    return 1;
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
      return 1;
    }
  } else {
    integrationSlug = rawArg;
  }

  // Validate --environment values early (before any network requests)
  const environments = flags['--environment'];
  if (environments?.length) {
    const envValidation = validateEnvironments(environments);
    if (!envValidation.valid) {
      output.error(
        `Invalid environment value: ${envValidation.invalid.map(e => `"${e}"`).join(', ')}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
      );
      return 1;
    }
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
  });
}

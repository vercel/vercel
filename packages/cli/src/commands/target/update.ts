import chalk from 'chalk';
import output from '../../output-manager';
import { targetCommand, updateSubcommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';
import { formatProject } from '../../util/projects/format-project';
import { formatEnvironment } from '../../util/target/format-environment';
import { STANDARD_ENVIRONMENTS } from '../../util/target/standard-environments';
import { parseBranchMatcher } from '../../util/target/parse-branch-matcher';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { TargetUpdateTelemetryClient } from '../../util/telemetry/commands/target/update';
import type Client from '../../util/client';
import type { CustomEnvironment } from '@vercel-internals/types';

// Type alias (not interface) so it satisfies the client's JSONObject body type.
type UpdateCustomEnvironmentBody = {
  slug?: string;
  description?: string;
  branchMatcher?: { type: string; pattern: string };
};

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const { cwd } = client;

  const telemetry = new TargetUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        'target update <name>'
      )}`
    );
    return 2;
  }

  const [nameOrId] = args;
  const slug = flags['--slug'];
  const description = flags['--description'];
  const branchMatcherType = flags['--branch-matcher-type'];
  const branchMatcherPattern = flags['--branch-matcher-pattern'];
  const projectName = flags['--project'];

  telemetry.trackCliArgumentName(nameOrId);
  telemetry.trackCliOptionSlug(slug);
  telemetry.trackCliOptionDescription(description);
  telemetry.trackCliOptionBranchMatcherType(branchMatcherType);
  telemetry.trackCliOptionBranchMatcherPattern(branchMatcherPattern);
  telemetry.trackCliOptionProject(projectName);
  telemetry.trackCliFlagYes(flags['--yes']);

  const hasBranchMatcherFlag =
    branchMatcherType !== undefined || branchMatcherPattern !== undefined;
  if (
    slug === undefined &&
    description === undefined &&
    !hasBranchMatcherFlag
  ) {
    output.error(
      `No changes provided. Pass at least one of ${chalk.bold(
        '--slug'
      )}, ${chalk.bold('--description')}, or ${chalk.bold(
        '--branch-matcher-type'
      )} with ${chalk.bold('--branch-matcher-pattern')}.`
    );
    return 2;
  }

  if (
    STANDARD_ENVIRONMENTS.includes(
      nameOrId as (typeof STANDARD_ENVIRONMENTS)[number]
    )
  ) {
    output.error(
      `${chalk.bold(
        nameOrId
      )} is a built-in environment and cannot be updated as a custom environment.`
    );
    return 1;
  }

  const matcherResult = parseBranchMatcher(
    branchMatcherType,
    branchMatcherPattern
  );
  if (!matcherResult.valid) {
    output.error(matcherResult.error);
    return 1;
  }

  const autoConfirm = !!flags['--yes'];
  const link = await ensureLink(targetCommand.name, client, cwd, {
    autoConfirm,
    projectName,
    failIfNotFound: Boolean(projectName),
  });
  if (typeof link === 'number') {
    return link;
  }

  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  const body: UpdateCustomEnvironmentBody = {};
  if (slug !== undefined) {
    body.slug = slug;
  }
  if (description !== undefined) {
    body.description = description;
  }
  if (matcherResult.branchMatcher) {
    body.branchMatcher = matcherResult.branchMatcher;
  }

  output.spinner(
    `Updating custom environment ${chalk.bold(nameOrId)} for ${projectSlugLink}`
  );

  const url = `/projects/${encodeURIComponent(
    link.project.id
  )}/custom-environments/${encodeURIComponent(nameOrId)}`;

  let environment: CustomEnvironment;
  try {
    environment = (await client.fetch(url, {
      method: 'PATCH',
      accountId: link.org.id,
      body,
    })) as CustomEnvironment;
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error) && error.status === 404) {
      output.error(
        `Custom environment ${chalk.bold(
          nameOrId
        )} was not found under ${projectSlugLink}.`
      );
      return 1;
    }
    if (isAPIError(error) && error.status === 400) {
      output.error(error.serverMessage || 'The request was invalid.');
      return 1;
    }
    printError(error);
    return 1;
  }

  output.stopSpinner();

  output.log(
    `Updated custom environment ${formatEnvironment(
      link.org.slug,
      link.project.name,
      environment
    )} under ${projectSlugLink}`
  );

  return 0;
}

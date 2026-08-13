import chalk from 'chalk';
import output from '../../output-manager';
import { addSubcommand, targetCommand } from './command';
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
import { TargetAddTelemetryClient } from '../../util/telemetry/commands/target/add';
import type Client from '../../util/client';
import type { CustomEnvironment } from '@vercel-internals/types';

// Type alias (not interface) so it satisfies the client's JSONObject body type.
type CreateCustomEnvironmentBody = {
  slug: string;
  description?: string;
  branchMatcher?: { type: string; pattern: string };
  copyEnvVarsFrom?: string;
};

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const { cwd } = client;

  const telemetry = new TargetAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
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
        'target add <name>'
      )}`
    );
    return 2;
  }

  const [name] = args;
  const description = flags['--description'];
  const branchMatcherType = flags['--branch-matcher-type'];
  const branchMatcherPattern = flags['--branch-matcher-pattern'];
  const copyEnvVarsFrom = flags['--copy-env-vars-from'];
  const projectName = flags['--project'];

  telemetry.trackCliArgumentName(name);
  telemetry.trackCliOptionDescription(description);
  telemetry.trackCliOptionBranchMatcherType(branchMatcherType);
  telemetry.trackCliOptionBranchMatcherPattern(branchMatcherPattern);
  telemetry.trackCliOptionCopyEnvVarsFrom(copyEnvVarsFrom);
  telemetry.trackCliOptionProject(projectName);
  telemetry.trackCliFlagYes(flags['--yes']);

  if (
    STANDARD_ENVIRONMENTS.includes(
      name as (typeof STANDARD_ENVIRONMENTS)[number]
    )
  ) {
    output.error(
      `${chalk.bold(
        name
      )} is a built-in environment and cannot be created as a custom environment. Choose a different name.`
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

  const body: CreateCustomEnvironmentBody = { slug: name };
  if (description !== undefined) {
    body.description = description;
  }
  if (matcherResult.branchMatcher) {
    body.branchMatcher = matcherResult.branchMatcher;
  }
  if (copyEnvVarsFrom !== undefined) {
    body.copyEnvVarsFrom = copyEnvVarsFrom;
  }

  output.spinner(
    `Adding custom environment ${chalk.bold(name)} to ${projectSlugLink}`
  );

  const url = `/projects/${encodeURIComponent(
    link.project.id
  )}/custom-environments`;

  let environment: CustomEnvironment;
  try {
    environment = (await client.fetch(url, {
      method: 'POST',
      accountId: link.org.id,
      body,
    })) as CustomEnvironment;
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error) && error.status === 400) {
      output.error(error.serverMessage || 'The request was invalid.');
      return 1;
    }
    if (isAPIError(error) && error.status === 409) {
      output.error(
        `A custom environment named ${chalk.bold(
          name
        )} already exists under ${projectSlugLink}.`
      );
      return 1;
    }
    printError(error);
    return 1;
  }

  output.stopSpinner();

  output.log(
    `Added custom environment ${formatEnvironment(
      link.org.slug,
      link.project.name,
      environment
    )} to ${projectSlugLink}`
  );

  return 0;
}

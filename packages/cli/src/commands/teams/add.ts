import chalk from 'chalk';
import stamp from '../../util/output/stamp';
import eraseLines from '../../util/output/erase-lines';
import chars from '../../util/output/chars';
import invite from './invite';
import { writeToConfigFile } from '../../util/config/files';
import { getCommandName } from '../../util/pkg-name';
import type Client from '../../util/client';
import createTeam from '../../util/teams/create-team';
import patchTeam from '../../util/teams/patch-team';
import { errorToString, isError } from '@vercel/error-utils';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import param from '../../util/output/param';
import { addSubcommand } from './command';

const validateSlug = (value: string) => /^[a-z]+[a-z0-9_-]*$/.test(value);
const validateName = (value: string) => /^[ a-zA-Z0-9_-]+$/.test(value);

const teamUrlPrefix = 'Team URL'.padEnd(14) + chalk.gray('vercel.com/');
const teamNamePrefix = 'Team Name'.padEnd(14);

export default async function add(
  client: Client,
  argv: string[] = []
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const slugFlag = parsedArgs.flags['--slug'] as string | undefined;
  const nameFlag = parsedArgs.flags['--name'] as string | undefined;

  if (client.nonInteractive) {
    const missing: string[] = [];
    if (!slugFlag || !slugFlag.trim()) missing.push('--slug');
    if (!nameFlag || !nameFlag.trim()) missing.push('--name');
    if (missing.length > 0) {
      const required = missing.map(p => param(p)).join(' and ');
      const verb = missing.length === 1 ? 'is' : 'are';
      output.error(
        `In non-interactive mode ${required} ${verb} required. Example: ${getCommandName(
          'teams add --slug acme --name "Acme Corp"'
        )}`
      );
      return 1;
    }
    const slug = (slugFlag as string).trim().toLowerCase();
    const name = (nameFlag as string).trim();
    if (!validateSlug(slug)) {
      output.error(
        `Invalid ${param('--slug')}: must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores (e.g. ${param('acme')})`
      );
      return 1;
    }
    if (!validateName(name)) {
      output.error(
        `Invalid ${param('--name')}: only letters, numbers, spaces, hyphens, and underscores allowed`
      );
      return 1;
    }

    output.spinner(teamUrlPrefix + slug);
    let team;
    try {
      team = await createTeam(client, { slug });
    } catch (err: unknown) {
      output.stopSpinner();
      output.error(errorToString(err));
      return 1;
    }
    output.stopSpinner();

    output.spinner(teamNamePrefix + name);
    try {
      const res = await patchTeam(client, team.id, { name });
      team = Object.assign(team, res);
    } catch (err: unknown) {
      output.stopSpinner();
      output.error(errorToString(err));
      return 1;
    }
    output.stopSpinner();

    client.config.currentTeam = team.id;
    writeToConfigFile(client.config);
    output.success(
      `Team ${chalk.bold(team.name)} (${chalk.cyan(`vercel.com/${slug}`)}) created.`
    );
    return 0;
  }

  let slug: string | undefined = slugFlag?.trim().toLowerCase();
  let team;
  let elapsed;

  output.log(
    `Pick a team identifier for its URL (e.g.: ${chalk.cyan(
      '`vercel.com/acme`'
    )})`
  );
  do {
    try {
      slug = await client.input.text({
        message: `- ${teamUrlPrefix}`,
        validate: validateSlug,
        default: slug,
      });
    } catch (err: unknown) {
      if (isError(err) && err.message === 'USER_ABORT') {
        output.log('Canceled');
        return 0;
      }

      throw err;
    }

    elapsed = stamp();
    output.spinner(teamUrlPrefix + slug);

    try {
      team = await createTeam(client, { slug: slug! });
    } catch (err: unknown) {
      output.stopSpinner();
      output.print(eraseLines(2));
      output.error(errorToString(err));
    }
  } while (!team);

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  output.success(`Team created ${elapsed()}`);
  output.log(`${chalk.cyan(`${chars.tick} `) + teamUrlPrefix + slug}\n`);
  output.log('Pick a display name for your team');

  let name: string | undefined = nameFlag?.trim();

  try {
    name = await client.input.text({
      message: `- ${teamNamePrefix}`,
      validate: validateName,
      default: name,
    });
  } catch (err: unknown) {
    if (isError(err) && err.message === 'USER_ABORT') {
      output.log('No name specified');
      return 2;
    }

    throw err;
  }

  elapsed = stamp();
  output.spinner(teamNamePrefix + name);

  const res = await patchTeam(client, team.id, { name: name! });

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  team = Object.assign(team, res);

  output.success(`Team name saved ${elapsed()}`);
  output.log(`${chalk.cyan(`${chars.tick} `) + teamNamePrefix + team.name}\n`);

  // Update config file
  output.spinner('Saving');
  client.config.currentTeam = team.id;
  writeToConfigFile(client.config);
  output.stopSpinner();

  await invite(client, [], {
    introMsg: 'Invite your teammates! When done, press enter on an empty field',
    noopMsg: `You can invite teammates later by running ${getCommandName(
      `teams invite`
    )}`,
  });

  return 0;
}

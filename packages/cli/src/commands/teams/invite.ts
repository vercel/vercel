import chalk from 'chalk';
import type Client from '../../util/client';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import chars from '../../util/output/chars';
import eraseLines from '../../util/output/erase-lines';
import getUser from '../../util/get-user';
import { getCommandName } from '../../util/pkg-name';
import { email as regexEmail } from '../../util/input/regexes';
import getTeams from '../../util/teams/get-teams';
import inviteUserToTeam from '../../util/teams/invite-user-to-team';
import { isAPIError } from '../../util/errors-ts';
import { errorToString, isError } from '@vercel/error-utils';
import { TeamsInviteTelemetryClient } from '../../util/telemetry/commands/teams/invite';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { inviteSubcommand } from './command';

const validateEmail = (data: string) =>
  regexEmail.test(data.trim()) || data.length === 0;

const domains = Array.from(
  new Set([
    'aol.com',
    'gmail.com',
    'google.com',
    'yahoo.com',
    'ymail.com',
    'hotmail.com',
    'live.com',
    'outlook.com',
    'inbox.com',
    'mail.com',
    'gmx.com',
    'icloud.com',
  ])
);

export default async function invite(
  client: Client,
  argv: string[],
  { introMsg = '', noopMsg = 'No changes made' } = {}
): Promise<number> {
  const { config, telemetryEventStore } = client;
  const { currentTeam: currentTeamId } = config;
  const telemetry = new TeamsInviteTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inviteSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args: emails } = parsedArgs;

  output.spinner('Fetching teams');
  const teams = await getTeams(client);
  const currentTeam = teams.find(team => team.id === currentTeamId);

  output.spinner('Fetching user information');
  const user = await getUser(client);

  domains.push(user.email.split('@')[1]);

  if (!currentTeam) {
    // We specifically need a team scope here
    const err = `You can't run this command under ${param(
      user.username || user.email
    )}.\nPlease select a team scope using ${getCommandName(
      `switch`
    )} or use ${cmd('--scope')}`;
    output.error(err);
    return 1;
  }

  output.log(
    introMsg || `Inviting team members to ${chalk.bold(currentTeam.name)}`
  );

  telemetry.trackCliArgumentEmail(emails);

  if (emails.length > 0) {
    for (const email of emails) {
      if (regexEmail.test(email)) {
        output.spinner(email);
        const elapsed = stamp();
        let userInfo = null;

        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await inviteUserToTeam(client, currentTeam.id, email);
          userInfo = res.username;
        } catch (err: unknown) {
          if (isAPIError(err) && err.code === 'user_not_found') {
            output.error(`No user exists with the email address "${email}".`);
            return 1;
          }

          throw err;
        }

        output.log(
          `${chalk.cyan(chars.tick)} ${email}${
            userInfo ? ` (${userInfo})` : ''
          } ${elapsed()}`
        );
      } else {
        output.log(`${chalk.red(`✖ ${email}`)} ${chalk.gray('[invalid]')}`);
      }
    }
    return 0;
  }

  const inviteUserPrefix = 'Invite User'.padEnd(14);
  const sentEmailPrefix = 'Sent Email'.padEnd(14);
  let hasError = false;
  let email;
  do {
    email = '';
    try {
      // eslint-disable-next-line no-await-in-loop
      email = await client.input.text({
        message: `- ${inviteUserPrefix}`,
        validate: validateEmail,
      });
    } catch (err: unknown) {
      if (!isError(err) || err.message !== 'USER_ABORT') {
        throw err;
      }
    }
    let elapsed;
    if (email) {
      elapsed = stamp();
      output.spinner(inviteUserPrefix + email);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { username } = await inviteUserToTeam(
          client,
          currentTeam.id,
          email
        );
        email = `${email}${username ? ` (${username})` : ''} ${elapsed()}`;
        emails.push(email);
        output.log(`${chalk.cyan(chars.tick)} ${sentEmailPrefix}${email}`);
        if (hasError) {
          hasError = false;
          process.stderr.write(eraseLines(emails.length + 2));
          output.log(
            introMsg ||
              `Inviting team members to ${chalk.bold(currentTeam.name)}`
          );
          for (const email of emails) {
            output.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
          }
        }
      } catch (err) {
        output.stopSpinner();
        process.stderr.write(eraseLines(emails.length + 2));
        output.error(errorToString(err));
        hasError = true;
        for (const email of emails) {
          output.log(`${chalk.cyan(chars.tick)} ${sentEmailPrefix}${email}`);
        }
      }
    }
  } while (email !== '');

  output.stopSpinner();
  process.stderr.write(eraseLines(emails.length + 2));

  const n = emails.length;
  if (emails.length === 0) {
    output.log(noopMsg);
  } else {
    output.success(`Invited ${n} teammate${n > 1 ? 's' : ''}`);
    for (const email of emails) {
      output.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
    }
  }

  return 0;
}

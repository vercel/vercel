import chalk from 'chalk';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import chars from '../../util/output/chars';
import textInput from '../../util/input/text';
import eraseLines from '../../util/output/erase-lines';
import getUser from '../../util/get-user';
import { getCommandName } from '../../util/pkg-name';
import { email as regexEmail } from '../../util/input/regexes';
import getTeams from '../../util/teams/get-teams';
import inviteUserToTeam from '../../util/teams/invite-user-to-team';
import { isAPIError } from '../../util/errors-ts';
import { errorToString, isError } from '../../util/is-error';

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

const emailAutoComplete = (value: string, teamSlug: string) => {
  const parts = value.split('@');

  if (parts.length === 2 && parts[1].length > 0) {
    const [, host] = parts;
    let suggestion: string | false = false;

    domains.unshift(teamSlug);
    for (const domain of domains) {
      if (domain.startsWith(host)) {
        suggestion = domain.slice(host.length);
        break;
      }
    }

    domains.shift();
    return suggestion;
  }

  return false;
};

export default async function invite(
  client: Client,
  emails: string[] = [],
  { introMsg = '', noopMsg = 'No changes made' } = {}
): Promise<number> {
  const { config, output } = client;
  const { currentTeam: currentTeamId } = config;

  output.spinner('Fetching teams');
  const teams = await getTeams(client);
  const currentTeam = teams.find(team => team.id === currentTeamId);

  output.spinner('Fetching user information');
  const user = await getUser(client);

  domains.push(user.email.split('@')[1]);

  if (!currentTeam) {
    // We specifically need a team scope here
    let err = `You can't run this command under ${param(
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
      email = await textInput({
        label: `- ${inviteUserPrefix}`,
        validateValue: validateEmail,
        autoComplete: value => emailAutoComplete(value, currentTeam.slug),
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

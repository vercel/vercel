import chalk from 'chalk';
import { email as regexEmail } from '../../util/input/regexes';
import cmd from '../../util/output/cmd.ts';
import stamp from '../../util/output/stamp.ts';
import param from '../../util/output/param.ts';
import chars from '../../util/output/chars';
import textInput from '../../util/input/text';
import eraseLines from '../../util/output/erase-lines';
import getUser from '../../util/get-user.ts';
import { getCommandName } from '../../util/pkg-name.ts';

const validateEmail = data => regexEmail.test(data.trim()) || data.length === 0;

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

const emailAutoComplete = (value, teamSlug) => {
  const parts = value.split('@');

  if (parts.length === 2 && parts[1].length > 0) {
    const [, host] = parts;
    let suggestion = false;

    domains.unshift(teamSlug);
    for (const domain of domains) {
      if (domain.startsWith(host)) {
        suggestion = domain.substr(host.length);
        break;
      }
    }

    domains.shift();
    return suggestion;
  }

  return false;
};

export default async function invite(
  client,
  argv,
  teams,
  { introMsg, noopMsg = 'No changes made' } = {}
) {
  const { config, output } = client;
  const { currentTeam: currentTeamId } = config;

  output.spinner('Fetching teams');
  const list = (await teams.ls()).teams;
  const currentTeam = list.find(team => team.id === currentTeamId);

  output.spinner('Fetching user information');
  let user;
  try {
    user = await getUser(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

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

  if (argv._.length > 0) {
    for (const email of argv._) {
      if (regexEmail.test(email)) {
        output.spinner(email);
        const elapsed = stamp();
        let userInfo = null;

        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await teams.inviteUser({ teamId: currentTeam.id, email });
          userInfo = res.name || res.username;
        } catch (err) {
          if (err.code === 'user_not_found') {
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
    return;
  }

  const inviteUserPrefix = 'Invite User'.padEnd(14);
  const sentEmailPrefix = 'Sent Email'.padEnd(14);
  const emails = [];
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
    } catch (err) {
      if (err.message !== 'USER_ABORT') {
        throw err;
      }
    }
    let elapsed;
    if (email) {
      elapsed = stamp();
      output.spinner(inviteUserPrefix + email);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { name, username } = await teams.inviteUser({
          teamId: currentTeam.id,
          email,
        });
        const userInfo = name || username;
        email = `${email}${userInfo ? ` (${userInfo})` : ''} ${elapsed()}`;
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
        output.error(err.message);
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
}

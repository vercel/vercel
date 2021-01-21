import chalk from 'chalk';
import { email as regexEmail } from '../../util/input/regexes';
import wait from '../../util/output/wait';
import cmd from '../../util/output/cmd.ts';
import info from '../../util/output/info';
import stamp from '../../util/output/stamp.ts';
import param from '../../util/output/param.ts';
import error from '../../util/output/error.ts';
import chars from '../../util/output/chars';
import rightPad from '../../util/output/right-pad';
import textInput from '../../util/input/text';
import eraseLines from '../../util/output/erase-lines';
import success from '../../util/output/success';
import getUser from '../../util/get-user.ts';
import Client from '../../util/client.ts';
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

export default async function ({
  teams,
  args,
  config,
  introMsg,
  noopMsg = 'No changes made',
  apiUrl,
  token,
  output,
} = {}) {
  const { currentTeam: currentTeamId } = config;

  const stopSpinner = wait('Fetching teams');

  const list = (await teams.ls()).teams;
  const currentTeam = list.find(team => team.id === currentTeamId);

  stopSpinner();

  const stopUserSpinner = wait('Fetching user information');
  const client = new Client({ apiUrl, token, output });
  let user;
  try {
    user = await getUser(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      console.error(error(err.message));
      return 1;
    }

    throw err;
  }

  stopUserSpinner();

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

  console.log(
    info(introMsg || `Inviting team members to ${chalk.bold(currentTeam.name)}`)
  );

  if (args.length > 0) {
    for (const email of args) {
      if (regexEmail.test(email)) {
        const stopSpinner = wait(email);
        const elapsed = stamp();
        let userInfo = null;

        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await teams.inviteUser({ teamId: currentTeam.id, email });
          userInfo = res.name || res.username;
        } catch (err) {
          if (err.code === 'user_not_found') {
            console.error(
              error(`No user exists with the email address "${email}".`)
            );
            return 1;
          }

          throw err;
        }

        stopSpinner();
        console.log(
          `${chalk.cyan(chars.tick)} ${email}${
            userInfo ? ` (${userInfo})` : ''
          } ${elapsed()}`
        );
      } else {
        console.log(`${chalk.red(`✖ ${email}`)} ${chalk.gray('[invalid]')}`);
      }
    }
    return;
  }

  const inviteUserPrefix = rightPad('Invite User', 14);
  const sentEmailPrefix = rightPad('Sent Email', 14);
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
    let stopSpinner;
    if (email) {
      elapsed = stamp();
      stopSpinner = wait(inviteUserPrefix + email);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { name, username } = await teams.inviteUser({
          teamId: currentTeam.id,
          email,
        });
        stopSpinner();
        const userInfo = name || username;
        email = `${email}${userInfo ? ` (${userInfo})` : ''} ${elapsed()}`;
        emails.push(email);
        console.log(`${chalk.cyan(chars.tick)} ${sentEmailPrefix}${email}`);
        if (hasError) {
          hasError = false;
          process.stdout.write(eraseLines(emails.length + 2));
          console.log(
            info(
              introMsg ||
                `Inviting team members to ${chalk.bold(currentTeam.name)}`
            )
          );
          for (const email of emails) {
            console.log(
              `${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`
            );
          }
        }
      } catch (err) {
        stopSpinner();
        process.stdout.write(eraseLines(emails.length + 2));
        console.error(error(err.message));
        hasError = true;
        for (const email of emails) {
          console.log(`${chalk.cyan(chars.tick)} ${sentEmailPrefix}${email}`);
        }
      }
    }
  } while (email !== '');

  process.stdout.write(eraseLines(emails.length + 2));

  const n = emails.length;
  if (emails.length === 0) {
    console.log(info(noopMsg));
  } else {
    console.log(success(`Invited ${n} teammate${n > 1 ? 's' : ''}`));
    for (const email of emails) {
      console.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
    }
  }
}

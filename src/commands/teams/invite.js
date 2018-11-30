import chalk from 'chalk';
import { email as regexEmail } from '../../util/input/regexes';
import wait from '../../util/output/wait';
import fatalError from '../../util/fatal-error';
import cmd from '../../util/output/cmd';
import info from '../../util/output/info';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import chars from '../../util/output/chars';
import rightPad from '../../util/output/right-pad';
import textInput from '../../util/input/text';
import eraseLines from '../../util/output/erase-lines';
import success from '../../util/output/success';
import error from '../../util/output/error';
import getUser from '../../util/get-user';

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
    'icloud.com'
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

export default async function(
  {
    teams,
    args,
    config,
    introMsg,
    noopMsg = 'No changes made',
    apiUrl,
    token
  } = {}
) {
  const { currentTeam: currentTeamId } = config;

  const stopSpinner = wait('Fetching teams');

  const list = (await teams.ls()).teams;
  const currentTeam = list.find(team => team.id === currentTeamId);

  stopSpinner();

  const stopUserSpinner = wait('Fetching user information');
  const user = await getUser({ apiUrl, token });

  stopUserSpinner();

  domains.push(user.email.split('@')[1]);

  if (!currentTeam) {
    let err = `You can't run this command under ${param(
      user.username || user.email
    )}.\n`;
    err += `${chalk.gray('>')} Run ${cmd('now switch')} to choose to a team.`;
    return fatalError(err);
  }

  console.log(
    info(introMsg || `Inviting team members to ${chalk.bold(currentTeam.name)}`)
  );

  if (args.length > 0) {
    for (const email of args) {
      if (regexEmail.test(email)) {
        const stopSpinner = wait(email);
        const elapsed = stamp();
        // eslint-disable-next-line no-await-in-loop
        await teams.inviteUser({ teamId: currentTeam.id, email });
        stopSpinner();
        console.log(`${chalk.cyan(chars.tick)} ${email} ${elapsed()}`);
      } else {
        console.log(`${chalk.red(`✖ ${email}`)} ${chalk.gray('[invalid]')}`);
      }
    }
    return;
  }

  const inviteUserPrefix = rightPad('Invite User', 14);
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
        autoComplete: value => emailAutoComplete(value, currentTeam.slug)
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
        await teams.inviteUser({ teamId: currentTeam.id, email });
        stopSpinner();
        email = `${email} ${elapsed()}`;
        emails.push(email);
        console.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
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
            console.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
          }
        }
      } catch (err) {
        stopSpinner();
        process.stdout.write(eraseLines(emails.length + 2));
        console.error(error(err.message));
        hasError = true;
        for (const email of emails) {
          console.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
        }
      }
    }
  } while (email !== '');

  process.stdout.write(eraseLines(emails.length + 2));

  const n = emails.length;
  if (emails.length === 0) {
    console.log(info(noopMsg));
  } else {
    console.log(success(`Invited ${n} team mate${n > 1 ? 's' : ''}`));
    for (const email of emails) {
      console.log(`${chalk.cyan(chars.tick)} ${inviteUserPrefix}${email}`);
    }
  }
};

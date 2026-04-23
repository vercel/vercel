import chalk from 'chalk';
import type Client from '../../util/client';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import chars from '../../util/output/chars';
import eraseLines from '../../util/output/erase-lines';
import getUser from '../../util/get-user';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
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
import {
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  getCommandNameWithGlobalFlags,
  getSameSubcommandSuggestionFlags,
} from '../../util/arg-common';

/** Append global argv flags (--cwd, etc.) so agents can re-run with same context. */
function withGlobalFlags(client: Client, commandTemplate: string): string {
  return getCommandNameWithGlobalFlags(commandTemplate, client.argv);
}

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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }
  const { args: emails } = parsedArgs;

  if (client.nonInteractive && emails.length === 0) {
    const fullArgs = client.argv.slice(2);
    const inviteIdx = fullArgs.indexOf('invite');
    const afterInvite = inviteIdx >= 0 ? fullArgs.slice(inviteIdx + 1) : [];
    // Same subcommand (teams invite): keep any flags the user passed.
    const flagParts = getSameSubcommandSuggestionFlags(afterInvite);
    const cmd = getCommandNamePlain(
      `teams invite <email> ${flagParts.join(' ')}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'missing_arguments',
        action: 'missing_arguments',
        message: `In non-interactive mode at least one email is required. Run: ${cmd}`,
        next: [
          {
            command: cmd,
            when: 'to invite teammates (replace <email> with a teammate email)',
          },
        ],
      },
      1
    );
    return 1;
  }

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
    if (client.nonInteractive) {
      const switchCmd = withGlobalFlags(client, 'teams switch <slug>');
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'team_scope_required',
          message: `Team scope is required for teams invite. Run ${switchCmd} or use --scope.`,
          next: [
            {
              command: switchCmd,
              when: 'to select a team scope (replace <slug> with your team slug)',
            },
          ],
        },
        1
      );
    }
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
          const res = await inviteUserToTeam(client, currentTeam.id, email);
          userInfo = res.username;
        } catch (err: unknown) {
          if (isAPIError(err) && err.code === 'user_not_found') {
            if (client.nonInteractive) {
              const fullArgs = client.argv.slice(2);
              const inviteIdx = fullArgs.indexOf('invite');
              const afterInvite =
                inviteIdx >= 0 ? fullArgs.slice(inviteIdx + 1) : [];
              const flagParts = getSameSubcommandSuggestionFlags(afterInvite);
              const retryCmd = getCommandNamePlain(
                `teams invite <email> ${flagParts.join(' ')}`.trim()
              );
              outputAgentError(
                client,
                {
                  status: 'error',
                  reason: 'user_not_found',
                  message: `No user exists with the email address "${email}".`,
                  next: [
                    {
                      command: retryCmd,
                    },
                  ],
                },
                1
              );
            }
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

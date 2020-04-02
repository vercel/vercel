import chalk from 'chalk';
import { NowContext, ProjectEnvTarget } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { getLinkedProject } from '../../util/projects/link';
import addEnvRecord from '../../util/env/add-env-record';
import cmd from '../../util/output/cmd';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';

type Options = {
  '--debug': boolean;
};

export default async function set(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  const link = await getLinkedProject(output, client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.print(
      `${chalk.red(
        'Error!'
      )} Your codebase isn’t linked to a project on ZEIT Now. Run ${cmd(
        'now'
      )} to link it.\n`
    );
    return 1;
  } else {
    const { org, project } = link;
    if (args.length > 3) {
      output.error(
        `Invalid number of arguments. See: ${chalk.cyan(
          '`now env --help`'
        )} for usage.`
      );
      return 1;
    }

    const addStamp = stamp();
    const [key, environmentType] = args;
    let value = 'some secret';
    const environments = [environmentType] as ProjectEnvTarget[];

    await withSpinner('Saving', async () => {
      for (const env of environments) {
        await addEnvRecord(output, client, project.id, key, value, env);
      }
    });

    output.print(
      `${prependEmoji(
        `Added ${environments.join(' ')} environment variable ${chalk.bold(
          key
        )} to project ${chalk.bold(project.id)} ${chalk.gray(addStamp())}`,
        emoji('success')
      )}\n`
    );

    output.print(
      `${prependEmoji(
        `Environments variables can be managed here: https://zeit.co/${org.slug}/${project.name}/settings#env`,
        emoji('tip')
      )}\n`
    );

    return 0;
  }
}

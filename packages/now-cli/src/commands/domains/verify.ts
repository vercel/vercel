import { NowContext } from '../../types';
import { Output } from '../../util/output';
import { getCommandName } from '../../util/pkg-name';

export default async function verify(
  _ctx: NowContext,
  _opts: {},
  args: string[],
  output: Output
) {
  const [domainName] = args;

  if (!domainName) {
    output.error(
      `${getCommandName(`domains verify <domain>`)} expects one argument`
    );

    return 1;
  }

  const error = new Error(
    `It's not necessary to verify Domains anymore. Instead, you can run ${getCommandName(
      `domains inspect ${domainName}`
    )} to see what you need to do in order to configure it properly.`
  );

  output.prettyError(
    Object.assign(error, {
      link: 'https://vercel.link/domain-verification-via-cli',
    })
  );

  return 0;
}

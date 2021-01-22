import { NowContext } from '../../types';
import { NowBuildError } from '@vercel/build-utils';
import { getCommandName } from '../../util/pkg-name';

export default async function verify(
  { output }: NowContext,
  _opts: {},
  args: string[]
) {
  const [domainName] = args;

  if (!domainName) {
    output.error(
      `${getCommandName(`domains verify <domain>`)} expects one argument`
    );

    return 1;
  }

  const error = new NowBuildError({
    code: 'domains_verify_command_deprecated',
    message: `It's not necessary to verify Domains anymore. Instead, you can run ${getCommandName(
      `domains inspect ${domainName}`
    )} to see what you need to do in order to configure it properly.`,
    link: 'https://vercel.link/domain-verification-via-cli',
  });

  output.prettyError(error);

  return 0;
}

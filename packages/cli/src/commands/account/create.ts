import type Client from '../../util/client';
import output from '../../output-manager';

const SIGNUP_URL = 'https://vercel.com/signup';

export default async function create(client: Client): Promise<number> {
  if (client.stdout.isTTY) {
    output.print(
      `${output.link(SIGNUP_URL, SIGNUP_URL, { fallback: false })}\n`
    );
  } else {
    client.stdout.write(`${SIGNUP_URL}\n`);
  }

  return 0;
}

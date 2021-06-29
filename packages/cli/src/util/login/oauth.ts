import open from 'open';
import { URL } from 'url';
import uid from 'uid-promise';
import Client from '../client';
import verify from './verify';
import highlight from '../output/highlight';
import link from '../output/link';
import eraseLines from '../output/erase-lines';

export default async function doOauthLogin(
  client: Client,
  url: URL,
  provider: string
): Promise<number | string> {
  const { output } = client;

  const verifyToken = await uid(32);
  url.searchParams.set('mode', 'login');
  url.searchParams.set('verifyToken', verifyToken);
  //url.searchParams.set('next', `http://localhost:${port}`);

  open(url.href);

  output.log(`Please visit the following URL in your web browser:`);
  output.log(link(url.href));
  output.spinner(`Waiting for ${provider} authentication to be completed`);

  // await confirmation

  const { email, token } = await verify(client, verifyToken, provider);

  output.stopSpinner();
  output.print(eraseLines(3));

  output.success(`${provider} authentication complete for ${highlight(email)}`);
  return token;
}

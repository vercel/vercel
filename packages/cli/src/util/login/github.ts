import { URL } from 'url';
import highlight from '../output/highlight';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default async function doGithubLogin(
  params: LoginParams
): Promise<number | string> {
  const { output } = params;

  const url = new URL(
    '/api/registration/login-with-github',
    'https://vercel.com'
  );
  url.searchParams.append('mode', 'login');

  output.spinner(
    'Please complete the GitHub authentication in your web browser'
  );

  const result = await doOauthLogin(url, params);

  if (typeof result !== 'number') {
    output.success(`GitHub authentication complete for ${highlight('email')}`);
  }

  return result;
}

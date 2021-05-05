import { URL } from 'url';
import { hostname } from 'os';
import { getTitleName } from '../pkg-name';
import highlight from '../output/highlight';
import { LoginParams } from './types';
import doOauthLogin from './oauth';

export default async function doSsoLogin(
  teamIdOrSlug: string,
  params: LoginParams
): Promise<number | string> {
  const { apiUrl, output } = params;

  const hyphens = new RegExp('-', 'g');
  const host = hostname().replace(hyphens, ' ').replace('.local', '');
  const tokenName = `${getTitleName()} CLI on ${host}`;

  const url = new URL('/auth/sso', apiUrl);
  url.searchParams.append('mode', 'login');
  url.searchParams.append('teamId', teamIdOrSlug);
  url.searchParams.append('tokenName', tokenName);

  output.spinner(
    'Please complete the SAML Single Sign-On authentication in your web browser'
  );

  const result = await doOauthLogin(url, params);

  if (typeof result !== 'number') {
    output.success(`SAML authentication complete for ${highlight('email')}`);
  }

  return result;
}

import confirm from '../input/confirm';
import doSsoLogin from './sso';
import showLoginPrompt from './prompt';
import { LoginParams } from './types';

export default async function reauthenticate(
  params: LoginParams,
  teamId: string | null
): Promise<string | number> {
  let result: string | number = 1;
  if (teamId) {
    // If `teamId` is defined then trigger the SAML login flow
    params.output.log(`You must re-authenticate with SAML.`);
    if (await confirm(`Log in with SAML?`, true)) {
      result = await doSsoLogin(params, teamId);
    }
  } else {
    // Personal account, or team that does not have SAML enabled
    params.output.log(`You must re-authenticate.`);
    result = await showLoginPrompt(params, { showSso: false });
  }
  return result;
}

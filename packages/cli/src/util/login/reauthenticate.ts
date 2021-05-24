import confirm from '../input/confirm';
import highlight from '../output/highlight';
import doSsoLogin from './sso';
import showLoginPrompt from './prompt';
import { LoginParams, SAMLError } from './types';

export default async function reauthenticate(
  params: LoginParams,
  error: SAMLError
): Promise<string | number> {
  let result: string | number = 1;
  if (error.teamId && error.enforced) {
    // If team has SAML enforced then trigger the SSO login directly
    params.output.log(
      `You must re-authenticate with SAML to use ${highlight(
        error.scope
      )} scope.`
    );
    if (await confirm(`Log in with SAML?`, true)) {
      result = await doSsoLogin(params, error.teamId);
    }
  } else {
    // Personal account, or team that does not have SAML enforced
    params.output.log(
      `You must re-authenticate to use ${highlight(error.scope)} scope.`
    );
    result = await showLoginPrompt(params, error);
  }
  return result;
}

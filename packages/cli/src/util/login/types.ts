import { Output } from '../output';
import { APIError } from '../errors-ts';

export interface LoginParams {
  apiUrl: string;
  output: Output;
  ssoUserId?: string;
}

export interface LoginData {
  token: string;
  securityCode: string;
}

export interface SAMLError extends APIError {
  saml: true;
  teamId: string | null;
  scope: string;
  enforced: boolean;
}

import { AuthConfig } from '../../types';
import { Output } from '../output';

export interface LoginParams {
  authConfig: AuthConfig;
  apiUrl: string;
  output: Output;
  ssoUserId?: string;
}

export interface LoginData {
  token: string;
  securityCode: string;
}

export interface SAMLError {
  saml?: true;
  teamId: string | null;
  scope: string;
  enforced?: boolean;
}

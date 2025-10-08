export interface LoginData {
  token: string;
  securityCode: string;
}

export type LoginResult = number | LoginResultSuccess;

export interface LoginResultSuccess {
  token: string;
  email: string;
  teamId?: string;
}

export interface SAMLError {
  saml?: true;
  teamId: string | null;
  scope: string;
  enforced?: boolean;
}

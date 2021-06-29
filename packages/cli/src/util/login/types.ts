export interface LoginData {
  token: string;
  securityCode: string;
}

export interface VerifyData {
  email: string;
  token: string;
}

export interface SAMLError {
  saml?: true;
  teamId: string | null;
  scope: string;
  enforced?: boolean;
}

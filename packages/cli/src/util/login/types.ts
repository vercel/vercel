export interface LoginData {
  token: string;
  securityCode: string;
}
export interface SignUpData {
  token?: string;
  securityCode?: string;
  error?: SignUpError;
}
export interface VerifyError {
  token: string;
  securityCode: string;
}
export interface VerifyCodeError {
  code: string;
  message: string;
  status: string;
}
export interface SignUpError {
  code: string;
  message: string;
  email: string;
}
export interface VerifyResult {
  email: string;
  error: VerifyError;
}

export type LoginResult = number | LoginResultSuccess;

export interface LoginResultSuccess {
  token: string;
  email: string;
  teamId?: string;
}
export interface phoneVerificationResult {
  status: string;
}
export interface phoneCodeVerificationResult {
  status?: string;
  error?: VerifyCodeError;
}

export interface SAMLError {
  saml?: true;
  teamId: string | null;
  scope: string;
  enforced?: boolean;
}

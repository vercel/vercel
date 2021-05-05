import { Output } from '../output';

export interface LoginParams {
  apiUrl: string;
  output: Output;
  ssoUserId?: string;
}

export interface LoginData {
  token: string;
  securityCode: string;
}

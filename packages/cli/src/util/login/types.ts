import { Output } from '../output';

export interface LoginParams {
  apiUrl: string;
  output: Output;
}

export interface LoginData {
  token: string;
  securityCode: string;
}

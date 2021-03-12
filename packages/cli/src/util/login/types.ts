import { Output } from '../output';
import { NowContext } from '../../types';

export interface LoginParams {
  apiUrl: string;
  output: Output;
  ctx: NowContext;
}

export interface LoginData {
  token: string;
  securityCode: string;
}

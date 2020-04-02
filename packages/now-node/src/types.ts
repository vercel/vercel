import { ServerResponse, IncomingMessage } from 'http';

export type NowRequestCookies = { [key: string]: string };
export type NowRequestQuery = { [key: string]: string | string[] };
export type NowRequestBody<T = any> = T | undefined;

export type NowRequest<T = any> = IncomingMessage & {
  query: NowRequestQuery;
  cookies: NowRequestCookies;
  body: NowRequestBody<T>;
};

export type NowResponse = ServerResponse & {
  send: (body: any) => NowResponse;
  json: (jsonBody: any) => NowResponse;
  status: (statusCode: number) => NowResponse;
};

export type NowApiHandler<T = any> = (
  req: NowRequest<T>,
  res: NowResponse
) => void;

import { ServerResponse, IncomingMessage } from 'http';

export type NowRequestCookies = { [key: string]: string };
export type NowRequestQuery = { [key: string]: string | string[] };
export type NowRequestBody = any;

export type NowRequest = IncomingMessage & {
  query: NowRequestQuery;
  cookies: NowRequestCookies;
  body: NowRequestBody;
};

export type NowResponse = ServerResponse & {
  send: (body: any) => NowResponse;
  json: (jsonBody: any) => NowResponse;
  status: (statusCode: number) => NowResponse;
  redirect: (statusOrUrl: string | number, url?: string) => NowResponse;
};

export type NowApiHandler = (req: NowRequest, res: NowResponse) => void;

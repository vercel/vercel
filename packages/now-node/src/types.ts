import { ServerResponse, IncomingMessage } from 'http';

export type NowRequestCookies = { [key: string]: string };
export type NowRequestQuery = { [key: string]: string | string[] };
export type NowRequestBody = any;
export type NowResponseSend = (body: any) => NowResponse;
export type NowResponseJson = (body: any) => NowResponse;
export type NowResponseStatus = (statusCode: number) => NowResponse;

export type NowRequest = IncomingMessage & {
  query: NowRequestQuery;
  cookies: NowRequestCookies;
  body: NowRequestBody;
};

export type NowResponse = ServerResponse & {
  send: NowResponseSend;
  json: NowResponseJson;
  status: NowResponseStatus;
};

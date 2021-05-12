/// <reference types="node" />
import { Server, IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
interface VercelProxyEvent {
  Action: string;
  body: string;
}
export interface VercelProxyRequest {
  isApiGateway?: boolean;
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export interface VercelProxyResponse {
  statusCode: number;
  headers: OutgoingHttpHeaders;
  body: string;
  encoding: BufferEncoding;
}
interface ServerLike {
  timeout?: number;
  listen: (
    opts: {
      host?: string;
      port?: number;
    },
    callback: (this: Server | null) => void
  ) => Server | void;
}
export declare class Bridge {
  private server;
  private listening;
  private resolveListening;
  private events;
  private reqIdSeed;
  private shouldStoreEvents;
  constructor(server?: ServerLike, shouldStoreEvents?: boolean);
  setServer(server: ServerLike): void;
  setStoreEvents(shouldStoreEvents: boolean): void;
  listen(): void | Server;
  launcher(event: VercelProxyEvent, context: any): Promise<VercelProxyResponse>;
  consumeEvent(reqId: string): VercelProxyRequest;
}
export {};

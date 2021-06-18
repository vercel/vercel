/// <reference types="node" />
import { Server } from 'http';
import {
  VercelProxyRequest,
  VercelProxyResponse,
  VercelProxyEvent,
  ServerLike,
} from './types';

export declare class Bridge {
  constructor(server?: ServerLike, shouldStoreEvents?: boolean);
  setServer(server: ServerLike): void;
  setStoreEvents(shouldStoreEvents: boolean): void;
  listen(): void | Server;
  launcher(event: VercelProxyEvent, context: any): Promise<VercelProxyResponse>;
  consumeEvent(reqId: string): VercelProxyRequest;
}
export {};

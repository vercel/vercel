/// <reference types="node" />
import { APIGatewayProxyEvent } from 'aws-lambda';
import { Server, IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
interface NowProxyEvent {
    Action: string;
    body: string;
}
export interface NowProxyRequest {
    isApiGateway?: boolean;
    method: string;
    path: string;
    headers: IncomingHttpHeaders;
    body: Buffer;
}
export interface NowProxyResponse {
    statusCode: number;
    headers: OutgoingHttpHeaders;
    body: string;
    encoding: string;
}
export declare class Bridge {
    private server;
    private listening;
    private resolveListening;
    constructor(server?: Server);
    setServer(server: Server): void;
    listen(): Server;
    launcher(event: NowProxyEvent | APIGatewayProxyEvent): Promise<NowProxyResponse>;
}
export {};

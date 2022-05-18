import type { APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyResult, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import '#internal/nitro/virtual/polyfill';
declare type Event = Omit<APIGatewayProxyEvent, 'pathParameters' | 'stageVariables' | 'requestContext' | 'resource'> | Omit<APIGatewayProxyEventV2, 'pathParameters' | 'stageVariables' | 'requestContext' | 'resource'>;
declare type Result = Exclude<APIGatewayProxyResult | APIGatewayProxyResultV2, string> & {
    statusCode: number;
};
export declare const handler: (event: Event, context: Context) => Promise<Result>;
export {};

import type { Context } from './context';
import type { Event } from './event';
import type { Response, BuilderResponse } from './response';
export interface HandlerCallback<ResponseType extends Response = Response> {
    (error: any, response: ResponseType): void;
}
export interface BaseHandler<ResponseType extends Response = Response, C extends Context = Context> {
    (event: Event, context: C, callback?: HandlerCallback<ResponseType>): void | Promise<ResponseType>;
}
export declare type Handler = BaseHandler<Response, Context>;
export declare type BuilderHandler = BaseHandler<BuilderResponse, Context>;

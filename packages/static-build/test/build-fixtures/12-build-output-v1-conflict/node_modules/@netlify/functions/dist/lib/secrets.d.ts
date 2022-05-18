import { Context as HandlerContext, Context } from '../function/context';
import { Event as HandlerEvent } from '../function/event';
import { BaseHandler, HandlerCallback } from '../function/handler';
import { Response } from '../function/response';
import { HandlerEventWithOneGraph, NetlifySecrets } from './secrets_helper';
export { getSecrets } from './secrets_helper';
export interface ContextWithSecrets extends Context {
    secrets: NetlifySecrets;
}
export declare type HandlerWithSecrets = BaseHandler<Response, ContextWithSecrets>;
export declare const withSecrets: (handler: BaseHandler<Response, ContextWithSecrets>) => (event: HandlerEventWithOneGraph | HandlerEvent, context: HandlerContext, callback: HandlerCallback<Response>) => Promise<void | Response>;

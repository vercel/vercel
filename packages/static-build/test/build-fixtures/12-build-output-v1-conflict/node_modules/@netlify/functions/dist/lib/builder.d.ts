import { BuilderHandler, Handler } from '../function/handler';
declare const wrapHandler: (handler: BuilderHandler) => Handler;
export { wrapHandler as builder };

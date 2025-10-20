import { extendExpress } from '.';

export const captureExpressApp = (expressModule: any) => {
  return extendExpress(expressModule);
};

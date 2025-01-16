import { Lambda, LambdaOptionsWithFiles } from './lambda';

interface NodejsLambdaOptions extends LambdaOptionsWithFiles {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  shouldUseWebApi?: boolean;
  awsLambdaHandler?: string;
}

export class NodejsLambda extends Lambda {
  launcherType: 'Nodejs';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  shouldUseWebApi?: boolean;
  awsLambdaHandler?: string;

  constructor({
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    shouldUseWebApi,
    awsLambdaHandler,
    ...opts
  }: NodejsLambdaOptions) {
    super(opts);
    this.launcherType = 'Nodejs';
    this.shouldAddHelpers = shouldAddHelpers;
    this.shouldAddSourcemapSupport = shouldAddSourcemapSupport;
    this.shouldUseWebApi = shouldUseWebApi;
    this.awsLambdaHandler = awsLambdaHandler;
  }
}

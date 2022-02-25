import { Lambda, LambdaOptions } from './lambda';

interface NodejsLambdaOptions extends LambdaOptions {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
}

export class NodejsLambda extends Lambda {
  launcherType: 'Nodejs';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;

  constructor({
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    awsLambdaHandler,
    ...opts
  }: NodejsLambdaOptions) {
    super(opts);
    this.launcherType = 'Nodejs';
    this.shouldAddHelpers = shouldAddHelpers;
    this.shouldAddSourcemapSupport = shouldAddSourcemapSupport;
    this.awsLambdaHandler = awsLambdaHandler;
  }
}

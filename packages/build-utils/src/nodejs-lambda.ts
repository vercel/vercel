import { Lambda, LambdaOptionsWithFiles } from './lambda';

interface NodejsLambdaOptions extends LambdaOptionsWithFiles {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  launcherType?: 'Nodejs' | 'Web';
}

export class NodejsLambda extends Lambda {
  launcherType: 'Nodejs' | 'Web';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;

  constructor({
    launcherType,
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    awsLambdaHandler,
    ...opts
  }: NodejsLambdaOptions) {
    super(opts);
    this.launcherType = launcherType || 'Nodejs';
    this.shouldAddHelpers = shouldAddHelpers;
    this.shouldAddSourcemapSupport = shouldAddSourcemapSupport;
    this.awsLambdaHandler = awsLambdaHandler;
  }
}

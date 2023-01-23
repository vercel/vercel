import type { LauncherType } from './types';
import { Lambda, LambdaOptionsWithFiles } from './lambda';

interface NodejsLambdaOptions extends LambdaOptionsWithFiles {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  launcherType?: LauncherType;
}

export class NodejsLambda extends Lambda {
  launcherType: NodejsLambdaOptions['launcherType'];
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

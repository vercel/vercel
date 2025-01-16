import { Lambda, LambdaOptionsWithFiles } from './lambda';

interface NodejsLambdaOptions extends LambdaOptionsWithFiles {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;
}

export class NodejsLambda extends Lambda {
  launcherType: 'Nodejs';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;

  constructor({
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    awsLambdaHandler,
    useWebApi,
    ...opts
  }: NodejsLambdaOptions) {
    super(opts);
    this.launcherType = 'Nodejs';
    this.shouldAddHelpers = shouldAddHelpers;
    this.shouldAddSourcemapSupport = shouldAddSourcemapSupport;
    this.awsLambdaHandler = awsLambdaHandler;
    this.useWebApi = useWebApi;
  }
}

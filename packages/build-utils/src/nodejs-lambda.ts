import { Lambda, LambdaOptionsWithFiles } from './lambda';

export interface NodejsLambdaOptions extends LambdaOptionsWithFiles {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  shouldDisableBytecodeCaching?: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;
}

export class NodejsLambda extends Lambda {
  launcherType: 'Nodejs';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  shouldDisableBytecodeCaching?: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;

  constructor({
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    shouldDisableBytecodeCaching,
    awsLambdaHandler,
    useWebApi,
    ...opts
  }: NodejsLambdaOptions) {
    super(opts);
    this.launcherType = 'Nodejs';
    this.shouldAddHelpers = shouldAddHelpers;
    this.shouldAddSourcemapSupport = shouldAddSourcemapSupport;
    this.shouldDisableBytecodeCaching = shouldDisableBytecodeCaching;
    this.awsLambdaHandler = awsLambdaHandler;
    this.useWebApi = useWebApi;
  }
}

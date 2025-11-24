import { Lambda, LambdaOptionsWithFiles } from './lambda';

interface NodejsLambdaOptions extends LambdaOptionsWithFiles {
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;
  shouldDisableAutomaticFetchInstrumentation?: boolean;
}

export class NodejsLambda extends Lambda {
  launcherType: 'Nodejs';
  shouldAddHelpers: boolean;
  shouldAddSourcemapSupport: boolean;
  awsLambdaHandler?: string;
  useWebApi?: boolean;
  shouldDisableAutomaticFetchInstrumentation?: boolean;

  constructor({
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    awsLambdaHandler,
    useWebApi,
    shouldDisableAutomaticFetchInstrumentation,
    ...opts
  }: NodejsLambdaOptions) {
    super(opts);
    this.launcherType = 'Nodejs';
    this.shouldAddHelpers = shouldAddHelpers;
    this.shouldAddSourcemapSupport = shouldAddSourcemapSupport;
    this.awsLambdaHandler = awsLambdaHandler;
    this.useWebApi = useWebApi;
    this.shouldDisableAutomaticFetchInstrumentation =
      shouldDisableAutomaticFetchInstrumentation;
  }
}

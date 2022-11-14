import { Bridge } from './bridge';
import { LauncherConfiguration } from './types';
export declare function makeVercelLauncher(
  config: LauncherConfiguration
): string;
export declare function getVercelLauncher({
  entrypointPath,
  helpersPath,
  shouldAddHelpers,
}: LauncherConfiguration): () => Bridge;
export declare function makeAwsLauncher(config: LauncherConfiguration): string;
export declare function getAwsLauncher({
  entrypointPath,
  awsLambdaHandler,
}: LauncherConfiguration): (e: any, context: any, callback: any) => any;
export {};

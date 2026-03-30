import type {
  BuildOptions,
  BuildResultV3,
  Files,
  PrepareCacheOptions,
  ShouldServeOptions,
  StartDevServerOptions,
  StartDevServerResult,
} from '@vercel/build-utils';

export interface Runtime {
  version: number;
  build: (options: BuildOptions) => Promise<BuildResultV3>;
  prepareCache: (options: PrepareCacheOptions) => Promise<Files> | undefined;
  shouldServe: (options: ShouldServeOptions) => Promise<boolean> | undefined;
  startDevServer: (
    options: StartDevServerOptions
  ) => Promise<StartDevServerResult> | undefined;
}

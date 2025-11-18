import type {
  BuildOptions,
  BuildResultV2Typical,
  Files,
  PrepareCacheOptions,
  ShouldServeOptions,
  StartDevServerOptions,
  StartDevServerResult,
} from '@vercel/build-utils';

export interface Runtime {
  version: number;
  build: (options: BuildOptions) => Promise<BuildResultV2Typical>;
  prepareCache?: (options: PrepareCacheOptions) => Promise<Files>;
  shouldServe?: (options: ShouldServeOptions) => Promise<boolean>;
  startDevServer?: (
    options: StartDevServerOptions
  ) => Promise<StartDevServerResult>;
}

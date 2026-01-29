import type { BuildOptions, Files } from '@vercel/build-utils';

/**
 * Core path options derived from BuildOptions.
 * - workPath: the workspace/project directory (where package.json is)
 * - repoRootPath: the root of the monorepo/repo
 */
export type PathOptions = Pick<BuildOptions, 'workPath' | 'repoRootPath'>;

/**
 * Options for the cervel build function.
 */
export type CervelBuildOptions = PathOptions & {
  entrypoint?: string;
  out: string;
};

/**
 * Options for the cervel serve function.
 */
export type CervelServeOptions = Pick<BuildOptions, 'workPath'> & {
  rest: Record<string, string | boolean | undefined>;
};

/**
 * Options for the rolldown bundler.
 */
export type RolldownOptions = PathOptions & {
  entrypoint: string;
  out: string;
};

/**
 * Options for the cervel plugin.
 */
export type PluginOptions = PathOptions & {
  outDir: string;
  shimBareImports?: boolean;
  context: { files: Files };
};

/**
 * Options for node file tracing.
 */
export type NodeFileTraceOptions = PathOptions & {
  keepTracedPaths: boolean;
  outDir: string;
  tracedPaths: string[];
  context: { files: Files };
};

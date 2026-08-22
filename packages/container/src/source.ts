/**
 * An explicitly resolved container build source supplied by another first-party
 * builder. This lets framework adapters generate a Dockerfile outside the
 * user's source tree while retaining the project directory as the build
 * context.
 */
export interface ContainerBuildSource {
  /** Absolute path to the Dockerfile or Containerfile to build. */
  dockerfilePath: string;
  /** Absolute path to use as the container build context. */
  contextDir: string;
  /**
   * Project-relative source used to resolve `functions` configuration.
   * Defaults to the builder entrypoint.
   */
  functionSource?: string;
}

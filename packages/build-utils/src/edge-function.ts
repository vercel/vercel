import type { Files, FunctionFramework } from './types';

/**
 * An Edge Functions output
 */
export class EdgeFunction {
  type: 'EdgeFunction';

  /**
   * A display name for the edge function.
   */
  name: string;

  /**
   * The deployment target.
   * Only v8-worker is currently supported.
   */
  deploymentTarget: 'v8-worker';

  /**
   * The entrypoint for the edge function.
   */
  entrypoint: string;

  /**
   * The list of files to be included in the edge function bundle.
   */
  files: Files;

  /**
   * Extra binary files to be included in the edge function
   */
  assets?: { name: string; path: string }[];

  /** The regions where the edge function will be executed on */
  regions?: string | string[];

  /** The framework */
  framework?: FunctionFramework;

  constructor(params: Omit<EdgeFunction, 'type'>) {
    this.type = 'EdgeFunction';
    this.name = params.name;
    this.deploymentTarget = params.deploymentTarget;
    this.entrypoint = params.entrypoint;
    this.files = params.files;
    this.assets = params.assets;
    this.regions = params.regions;
    this.framework = params.framework;
  }
}

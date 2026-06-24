import type { Env, Files } from './types';

export interface ContainerImageConfig {
  /**
   * The OCI image reference (e.g. `vcr.vercel.com/team/project/svc@sha256:...`).
   * Carried in `handler` per the build-output contract; api-builds surfaces it
   * as `image` downstream (see vercel/api#76729).
   */
  handler: string;
  runtime: 'container';
  command?: string[];
  environment?: Env;
}

export class ContainerImage {
  type: 'ContainerImage';
  files: Files;
  /** The OCI image reference, carried in `handler` (see ContainerImageConfig). */
  handler: string;
  runtime: 'container';
  command?: string[];
  environment: Env;

  constructor(params: Omit<ContainerImage, 'type'>) {
    this.type = 'ContainerImage';
    this.files = params.files;
    this.handler = params.handler;
    this.runtime = params.runtime;
    this.command = params.command;
    this.environment = params.environment;
  }
}

import type { LambdaArchitecture } from './lambda';
import type { Env, Files, MaxDuration, TriggerEvent } from './types';

export interface ContainerImageConfig {
  /**
   * The OCI image reference (e.g. `vcr.vercel.com/team/project/svc@sha256:...`).
   * The build output contract carries this value in `handler`.
   */
  handler: string;
  runtime: 'container';
  command?: string[];
  environment?: Env;
  architecture?: LambdaArchitecture;
  memory?: number;
  maxDuration?: MaxDuration;
  maxConcurrency?: number;
  regions?: string[];
  functionFailoverRegions?: string[];
  experimentalTriggers?: TriggerEvent[];
  supportsCancellation?: boolean;
}

export class ContainerImage {
  type: 'ContainerImage';
  files: Files;
  /** The OCI image reference, carried in `handler` (see ContainerImageConfig). */
  handler: string;
  runtime: 'container';
  command?: string[];
  environment: Env;
  architecture?: LambdaArchitecture;
  memory?: number;
  maxDuration?: MaxDuration;
  maxConcurrency?: number;
  regions?: string[];
  functionFailoverRegions?: string[];
  experimentalTriggers?: TriggerEvent[];
  supportsCancellation?: boolean;

  constructor(params: Omit<ContainerImage, 'type'>) {
    this.type = 'ContainerImage';
    this.files = params.files;
    this.handler = params.handler;
    this.runtime = params.runtime;
    this.command = params.command;
    this.environment = params.environment;
    this.architecture = params.architecture;
    this.memory = params.memory;
    this.maxDuration = params.maxDuration;
    this.maxConcurrency = params.maxConcurrency;
    this.regions = params.regions;
    this.functionFailoverRegions = params.functionFailoverRegions;
    this.experimentalTriggers = params.experimentalTriggers;
    this.supportsCancellation = params.supportsCancellation;
  }
}

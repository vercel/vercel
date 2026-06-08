import type { Env, Files } from './types';

export interface ContainerImageConfig {
  handler: string;
  runtime: 'container';
  architecture?: string;
  command?: string[];
  environment?: Env;
}

export class ContainerImage {
  type: 'ContainerImage';
  files: Files;
  handler: string;
  runtime: 'container';
  architecture?: string;
  command?: string[];
  environment: Env;

  constructor(params: Omit<ContainerImage, 'type'>) {
    this.type = 'ContainerImage';
    this.files = params.files;
    this.handler = params.handler;
    this.runtime = params.runtime;
    this.architecture = params.architecture;
    this.command = params.command;
    this.environment = params.environment;
  }
}

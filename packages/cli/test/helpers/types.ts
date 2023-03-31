import type execa from 'execa';

export interface TmpDir {
  name: string;
  removeCallback: () => void;
}

export interface Build {
  use: string;
}

export type NowJson = {
  name: string;
};

export type DeploymentLike = {
  error?: Error;
  builds: Build[];
};

export type CLIProcess = execa.ExecaChildProcess<string>;

export interface TurboDryRun {
  packages: Array<string>;
  tasks: Array<Task>;
}

export interface Task {
  taskId: string;
  task: string;
  package: string;
  hash: string;
  command: string;
  outputs: Array<string>;
  logFile: string;
  directory: string;
  dependencies: Array<string>;
  dependents: Array<string>;
}

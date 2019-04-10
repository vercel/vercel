import { BuilderParams, BuildResult } from './types';

export const version = 2;

export function build({ files, entrypoint }: BuilderParams): BuildResult {
  const output = {
    [entrypoint]: files[entrypoint]
  };
  return { output };
}

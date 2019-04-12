import { BuilderParams, BuildResult } from './types';

export function build({ files, entrypoint }: BuilderParams): BuildResult {
  const output = {
    [entrypoint]: files[entrypoint]
  };
  return { output };
}

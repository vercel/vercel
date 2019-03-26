import { BuilderParams, BuilderOutputs } from './types';

export function build({ files, entrypoint }: BuilderParams): BuilderOutputs {
  return {
    [entrypoint]: files[entrypoint]
  };
}

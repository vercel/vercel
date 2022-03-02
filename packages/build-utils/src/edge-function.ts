import type { File } from './types';

export type EdgeFunctionWasmBinding = {
  /**
   * A binding name within the user code.
   * Will be declared as a global variable.
   */
  name: `wasm_${string}`;

  /**
   * The actual WASM binary to bind.
   */
  file: File;
};

export type EdgeFunction = {
  type: 'EdgeFunction';
  /**
   * A display name for the edge function
   */
  name: string;

  /**
   * The deployment target.
   * Only v8-worker is currently supported.
   */
  deploymentTarget: 'v8-worker';

  /**
   * The source file. The user code.
   */
  script: File;

  /**
   * The source map for the user code.
   */
  scriptSourceMap?: File;

  /**
   * The environment variables in use for the user code, to be
   * bound into the edge function
   */
  envVarsInUse: string[];

  /**
   * WebAssembly bindings that the user code requires.
   */
  wasm: EdgeFunctionWasmBinding[];
};

/**
 * A helper to generate an EdgeFunction
 */
export function createEdgeFunction(
  params: Omit<EdgeFunction, 'type'>
): EdgeFunction {
  return {
    type: 'EdgeFunction',
    ...params,
  };
}

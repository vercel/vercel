import type { Files } from './types';

/**
 * A WASM binding
 */
export type EdgeFunctionWasmBinding = {
  /**
   * A binding name within the user code.
   * Will be declared as a global variable.
   */
  name: `wasm_${string}`;

  /**
   * A reference to the `files` object for a WASM binary
   * file
   */
  pathInFiles: string;
};

/**
 * An Edge Functions output
 */
export type EdgeFunction = {
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
   * The environment variables in use for the user code, to be
   * assigned to the edge function.
   */
  envVarsInUse: string[];

  /**
   * WebAssembly bindings that the user code requires.
   */
  wasmBindings: EdgeFunctionWasmBinding[];
};

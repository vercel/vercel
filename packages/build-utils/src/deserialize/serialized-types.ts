import type { Lambda } from '../lambda';
import type { NodejsLambda } from '../nodejs-lambda';
import type { EdgeFunction } from '../edge-function';
import type FileFsRef from '../file-fs-ref';
import type { Prerender } from '../prerender';

/**
 * Maps a type to a new type that does not contain any functions on it.
 * Useful for typing serialized `class` types, which will not contain
 * functions when serialized to JSON.
 */
export type Properties<T> = {
  [P in keyof T as T[P] extends (...args: any[]) => any ? never : P]: T[P];
};

type FilesMapProp = {
  filePathMap?: Record<string, string>;
};

/**
 * Type for the `.vc-config.json` file of a serialized
 * `ServerlessFunction` instance.
 */
export type SerializedLambda = Properties<Omit<Lambda, 'files' | 'zipBuffer'>> &
  FilesMapProp;

export type SerializedNodejsLambda = Properties<
  Omit<NodejsLambda, 'files' | 'zipBuffer'>
> &
  FilesMapProp;

export type SerializedFileFsRef = Properties<FileFsRef>;

export type SerializedPrerender = Properties<
  Omit<Prerender, 'lambda' | 'fallback'>
> & {
  fallback: SerializedFileFsRef | null;
};

export type SerializedEdgeFunction = Properties<
  Omit<EdgeFunction, 'name' | 'files' | 'deploymentTarget'>
> &
  FilesMapProp;

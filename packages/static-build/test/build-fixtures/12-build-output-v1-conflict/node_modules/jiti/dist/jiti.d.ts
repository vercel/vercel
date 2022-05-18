/// <reference types="node" />
import { TransformOptions, JITIOptions } from './types';
declare type Require = typeof require;
export interface JITI extends Require {
    transform: (opts: TransformOptions) => string;
    register: () => (() => void);
}
export default function createJITI(_filename: string, opts?: JITIOptions, parentModule?: typeof module): JITI;
export {};

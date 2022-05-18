/// <reference types="node" />
import vm from 'vm';
export declare type Compile = (filename: string, code: string) => vm.Script;
export declare function createCompile(): Compile;

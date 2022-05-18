/// <reference types="node" />
import { Dirent } from 'fs';
export declare function writeFile(path: string, data: string): Promise<void>;
export declare function readFile(path: string): Promise<any>;
export declare function stat(path: string): Promise<any>;
export declare function unlink(path: string): Promise<any>;
export declare function readdir(dir: string): Promise<Dirent[]>;
export declare function ensuredir(dir: string): Promise<void>;
export declare function readdirRecursive(dir: string, ignore?: (p: string) => boolean): Promise<string[]>;
export declare function rmRecursive(dir: string): Promise<void>;

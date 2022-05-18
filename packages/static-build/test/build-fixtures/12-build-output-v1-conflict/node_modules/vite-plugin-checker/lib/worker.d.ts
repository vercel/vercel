import { ConfigEnv } from 'vite';
import { SharedConfig, ServeAndBuildChecker, BuildInCheckers, BuildCheckBin, ServeChecker } from './types.js';
import 'worker_threads';
import 'eslint';
import './checkers/vls/initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';

interface WorkerScriptOptions {
    absFilename: string;
    buildBin: BuildCheckBin;
    serverChecker: ServeChecker;
}
interface Script<T> {
    mainScript: () => (config: T & SharedConfig, env: ConfigEnv) => ServeAndBuildChecker;
    workerScript: () => void;
}
declare function createScript<T extends Partial<BuildInCheckers>>({ absFilename, buildBin, serverChecker, }: WorkerScriptOptions): Script<T>;

export { Script, createScript };

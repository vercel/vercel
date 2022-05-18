import { UserPluginConfig } from './types.js';
import 'vite';
import 'worker_threads';
import 'eslint';
import './checkers/vls/initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';

declare function Plugin(userConfig: UserPluginConfig): Plugin;
declare function isObject(value: unknown): value is Record<string, any>;

export { Plugin as default, isObject };

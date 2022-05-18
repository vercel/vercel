import { Checker } from '../../Checker.js';
import 'vite';
import '../../types.js';
import 'worker_threads';
import 'eslint';
import '../vls/initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';
import '../../worker.js';

declare class VueTscChecker extends Checker<'vueTsc'> {
    constructor();
    init(): void;
}

export { VueTscChecker };

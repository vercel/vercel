import _treeKill from 'tree-kill';
import { promisify } from 'node:util';

export const treeKill = promisify(_treeKill);

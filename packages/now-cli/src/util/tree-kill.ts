import _treeKill from 'tree-kill';
import { promisify } from 'util';

export const treeKill = promisify(_treeKill);

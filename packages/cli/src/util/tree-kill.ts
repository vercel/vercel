import { promisify } from 'util';
import _treeKill from 'tree-kill';

export const treeKill = promisify(_treeKill);

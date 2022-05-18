import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import type { State } from './interface';
declare const _default: {
    JSXElement: {
        exit(path: NodePath<t.JSXElement>, state: State): void;
    };
};
export default _default;

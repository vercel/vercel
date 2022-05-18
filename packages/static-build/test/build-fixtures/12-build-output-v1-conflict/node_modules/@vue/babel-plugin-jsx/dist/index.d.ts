import * as t from '@babel/types';
import * as BabelCore from '@babel/core';
import { NodePath } from '@babel/traverse';
import type { VueJSXPluginOptions, State } from './interface';
export { VueJSXPluginOptions };
declare const _default: ({ types }: typeof BabelCore) => {
    name: string;
    inherits: any;
    visitor: {
        Program: {
            enter(path: NodePath<t.Program>, state: State): void;
            exit(path: NodePath<t.Program>): void;
        };
        JSXFragment: {
            enter(path: BabelCore.NodePath<t.JSXElement>, state: State): void;
        };
        JSXElement: {
            exit(path: BabelCore.NodePath<t.JSXElement>, state: State): void;
        };
    };
};
export default _default;

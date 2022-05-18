import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import type { State } from './interface';
export declare type Tag = t.Identifier | t.MemberExpression | t.StringLiteral | t.CallExpression;
declare const parseDirectives: (params: {
    name: string;
    path: NodePath<t.JSXAttribute>;
    value: t.Expression | null;
    state: State;
    tag: Tag;
    isComponent: boolean;
}) => {
    directiveName: string;
    modifiers: Set<string>[];
    values: (t.Expression | null)[];
    args: t.Expression[];
    directive: t.Expression[] | undefined;
};
export default parseDirectives;

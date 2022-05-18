import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import type { State } from './interface';
import SlotFlags from './slotFlags';
export declare const JSX_HELPER_KEY = "JSX_HELPER_KEY";
export declare const FRAGMENT = "Fragment";
export declare const KEEP_ALIVE = "KeepAlive";
/**
 * create Identifier
 * @param path NodePath
 * @param state
 * @param name string
 * @returns MemberExpression
 */
export declare const createIdentifier: (state: State, name: string) => t.Identifier | t.MemberExpression;
/**
 * Checks if string is describing a directive
 * @param src string
 */
export declare const isDirective: (src: string) => boolean;
/**
 * Should transformed to slots
 * @param tag string
 * @returns boolean
 */
export declare const shouldTransformedToSlots: (tag: string) => boolean;
/**
 * Check if a Node is a component
 *
 * @param t
 * @param path JSXOpeningElement
 * @returns boolean
 */
export declare const checkIsComponent: (path: NodePath<t.JSXOpeningElement>, state: State) => boolean;
/**
 * Transform JSXMemberExpression to MemberExpression
 * @param path JSXMemberExpression
 * @returns MemberExpression
 */
export declare const transformJSXMemberExpression: (path: NodePath<t.JSXMemberExpression>) => t.MemberExpression;
/**
 * Get tag (first attribute for h) from JSXOpeningElement
 * @param path JSXElement
 * @param state State
 * @returns Identifier | StringLiteral | MemberExpression | CallExpression
 */
export declare const getTag: (path: NodePath<t.JSXElement>, state: State) => t.Identifier | t.CallExpression | t.StringLiteral | t.MemberExpression;
export declare const getJSXAttributeName: (path: NodePath<t.JSXAttribute>) => string;
/**
 * Transform JSXText to StringLiteral
 * @param path JSXText
 * @returns StringLiteral | null
 */
export declare const transformJSXText: (path: NodePath<t.JSXText>) => t.StringLiteral | null;
/**
 * Transform JSXExpressionContainer to Expression
 * @param path JSXExpressionContainer
 * @returns Expression
 */
export declare const transformJSXExpressionContainer: (path: NodePath<t.JSXExpressionContainer>) => (t.Expression);
/**
 * Transform JSXSpreadChild
 * @param path JSXSpreadChild
 * @returns SpreadElement
 */
export declare const transformJSXSpreadChild: (path: NodePath<t.JSXSpreadChild>) => t.SpreadElement;
export declare const walksScope: (path: NodePath, name: string, slotFlag: SlotFlags) => void;
export declare const buildIIFE: (path: NodePath<t.JSXElement>, children: t.Expression[]) => t.Expression[];
export declare const isOn: (key: string) => boolean;
export declare const dedupeProperties: (properties?: t.ObjectProperty[], mergeProps?: boolean | undefined) => t.ObjectProperty[];
/**
 *  Check if an attribute value is constant
 * @param node
 * @returns boolean
 */
export declare const isConstant: (node: t.Expression | t.Identifier | t.Literal | t.SpreadElement | null) => boolean;
export declare const transformJSXSpreadAttribute: (nodePath: NodePath, path: NodePath<t.JSXSpreadAttribute>, mergeProps: boolean, args: (t.ObjectProperty | t.Expression | t.SpreadElement)[]) => void;

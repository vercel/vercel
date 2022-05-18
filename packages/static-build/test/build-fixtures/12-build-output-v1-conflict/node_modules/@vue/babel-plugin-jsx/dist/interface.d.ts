import * as t from '@babel/types';
import * as BabelCore from '@babel/core';
export declare type Slots = t.Identifier | t.ObjectExpression | null;
export declare type State = {
    get: (name: string) => any;
    set: (name: string, value: any) => any;
    opts: VueJSXPluginOptions;
    file: BabelCore.BabelFile;
};
export interface VueJSXPluginOptions {
    /** transform `on: { click: xx }` to `onClick: xxx` */
    transformOn?: boolean;
    /** enable optimization or not. */
    optimize?: boolean;
    /** merge static and dynamic class / style attributes / onXXX handlers */
    mergeProps?: boolean;
    /** configuring custom elements */
    isCustomElement?: (tag: string) => boolean;
    /** enable object slots syntax */
    enableObjectSlots?: boolean;
    /** Replace the function used when compiling JSX expressions */
    pragma?: string;
}

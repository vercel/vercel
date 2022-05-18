import type { NitroApp } from './app';
export interface NitroAppPlugin {
    (nitro: NitroApp): void;
}
export declare function defineNitroPlugin(def: NitroAppPlugin): NitroAppPlugin;
export declare const nitroPlugin: typeof defineNitroPlugin;

import { Plugin, OutputOptions } from "rollup";
import opn from "open";
import { TemplateType } from "./template-types";
export interface PluginVisualizerOptions {
    json?: boolean;
    filename?: string;
    title?: string;
    open?: boolean;
    openOptions?: opn.Options;
    template?: TemplateType;
    gzipSize?: boolean;
    brotliSize?: boolean;
    sourcemap?: boolean;
    projectRoot?: string | RegExp;
}
export declare const visualizer: (opts?: PluginVisualizerOptions | ((outputOptions: OutputOptions) => PluginVisualizerOptions)) => Plugin;
export default visualizer;

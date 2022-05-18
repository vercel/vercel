import { OutputChunk } from "rollup";
interface SourceMapModuleRenderInfo {
    id: string;
    renderedLength: number;
}
export declare const getSourcemapModules: (id: string, outputChunk: OutputChunk, dir: string) => Promise<Record<string, SourceMapModuleRenderInfo>>;
export {};

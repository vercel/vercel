export declare type SizeKey = "renderedLength" | "gzipLength" | "brotliLength";
export declare const isModuleTree: (mod: ModuleTree | ModuleTreeLeaf) => mod is ModuleTree;
export declare type ModuleUID = string;
export declare type BundleId = string;
export interface ModuleTreeLeaf {
    name: string;
    uid: ModuleUID;
}
export interface ModuleTree {
    name: string;
    children: Array<ModuleTree | ModuleTreeLeaf>;
}
export declare type ModulePart = {
    mainUid: ModuleUID;
} & ModuleLengths;
export declare type ModuleImport = {
    uid: ModuleUID;
    dynamic?: boolean;
};
export declare type ModuleMeta = {
    moduleParts: Record<BundleId, ModuleUID>;
    importedBy: ModuleImport[];
    imported: ModuleImport[];
    isEntry?: boolean;
    isExternal?: boolean;
    id: string;
};
export interface ModuleLengths {
    renderedLength: number;
    gzipLength: number;
    brotliLength: number;
}
export interface VisualizerData {
    version: number;
    tree: ModuleTree;
    nodeParts: Record<ModuleUID, ModulePart>;
    nodeMetas: Record<ModuleUID, ModuleMeta>;
    env: {
        [key: string]: unknown;
    };
    options: {
        gzip: boolean;
        brotli: boolean;
        sourcemap: boolean;
    };
}

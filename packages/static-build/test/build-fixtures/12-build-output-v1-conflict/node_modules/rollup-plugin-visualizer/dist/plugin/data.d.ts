import { GetModuleInfo } from "rollup";
import { ModuleLengths, ModuleTree, ModuleTreeLeaf } from "../types/types";
import { ModuleMapper } from "./module-mapper";
export declare const buildTree: (bundleId: string, modules: Array<ModuleLengths & {
    id: string;
}>, mapper: ModuleMapper) => ModuleTree;
export declare const mergeTrees: (trees: Array<ModuleTree | ModuleTreeLeaf>) => ModuleTree;
export declare const addLinks: (startModuleId: string, getModuleInfo: GetModuleInfo, mapper: ModuleMapper) => void;

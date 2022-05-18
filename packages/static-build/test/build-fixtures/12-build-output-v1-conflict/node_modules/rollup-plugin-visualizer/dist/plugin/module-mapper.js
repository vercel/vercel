"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleMapper = void 0;
const non_secure_1 = require("nanoid/non-secure");
const nanoid = (0, non_secure_1.customAlphabet)("1234567890abcdef", 4);
const UNIQUE_PREFIX = nanoid();
let COUNTER = 0;
const uniqueId = () => `${UNIQUE_PREFIX}-${COUNTER++}`;
class ModuleMapper {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.nodeParts = {};
        this.nodeMetas = {};
    }
    trimProjectRootId(moduleId) {
        return moduleId.replace(this.projectRoot, "");
    }
    getModuleUid(moduleId) {
        if (!(moduleId in this.nodeMetas)) {
            this.nodeMetas[moduleId] = {
                uid: uniqueId(),
                meta: { id: this.trimProjectRootId(moduleId), moduleParts: {}, imported: new Set(), importedBy: new Set() },
            };
        }
        return this.nodeMetas[moduleId].uid;
    }
    getBundleModuleUid(bundleId, moduleId) {
        if (!(moduleId in this.nodeMetas)) {
            this.nodeMetas[moduleId] = {
                uid: uniqueId(),
                meta: { id: this.trimProjectRootId(moduleId), moduleParts: {}, imported: new Set(), importedBy: new Set() },
            };
        }
        if (!(bundleId in this.nodeMetas[moduleId].meta.moduleParts)) {
            this.nodeMetas[moduleId].meta.moduleParts[bundleId] = uniqueId();
        }
        return this.nodeMetas[moduleId].meta.moduleParts[bundleId];
    }
    setNodePart(bundleId, moduleId, value) {
        const uid = this.getBundleModuleUid(bundleId, moduleId);
        if (uid in this.nodeParts) {
            throw new Error(`Override module: bundle id ${bundleId}, module id ${moduleId}, value ${JSON.stringify(value)}, existing value: ${JSON.stringify(this.nodeParts[uid])}`);
        }
        this.nodeParts[uid] = { ...value, mainUid: this.getModuleUid(moduleId) };
        return uid;
    }
    setNodeMeta(moduleId, value) {
        this.getModuleUid(moduleId);
        this.nodeMetas[moduleId].meta.isEntry = value.isEntry;
        this.nodeMetas[moduleId].meta.isExternal = value.isExternal;
    }
    hasNodePart(bundleId, moduleId) {
        if (!(moduleId in this.nodeMetas)) {
            return false;
        }
        if (!(bundleId in this.nodeMetas[moduleId].meta.moduleParts)) {
            return false;
        }
        if (!(this.nodeMetas[moduleId].meta.moduleParts[bundleId] in this.nodeParts)) {
            return false;
        }
        return true;
    }
    getNodeParts() {
        return this.nodeParts;
    }
    getNodeMetas() {
        const nodeMetas = {};
        for (const { uid, meta } of Object.values(this.nodeMetas)) {
            nodeMetas[uid] = {
                ...meta,
                imported: [...meta.imported].map((rawImport) => {
                    const [uid, dynamic] = rawImport.split(",");
                    const importData = { uid };
                    if (dynamic === "true") {
                        importData.dynamic = true;
                    }
                    return importData;
                }),
                importedBy: [...meta.importedBy].map((rawImport) => {
                    const [uid, dynamic] = rawImport.split(",");
                    const importData = { uid };
                    if (dynamic === "true") {
                        importData.dynamic = true;
                    }
                    return importData;
                }),
            };
        }
        return nodeMetas;
    }
    addImportedByLink(targetId, sourceId) {
        const sourceUid = this.getModuleUid(sourceId);
        this.getModuleUid(targetId);
        this.nodeMetas[targetId].meta.importedBy.add(sourceUid);
    }
    addImportedLink(sourceId, targetId, dynamic = false) {
        const targetUid = this.getModuleUid(targetId);
        this.getModuleUid(sourceId);
        this.nodeMetas[sourceId].meta.imported.add(String([targetUid, dynamic]));
    }
}
exports.ModuleMapper = ModuleMapper;

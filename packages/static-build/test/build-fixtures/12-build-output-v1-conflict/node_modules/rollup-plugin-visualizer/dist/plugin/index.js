"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.visualizer = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const open_1 = __importDefault(require("open"));
const version_1 = require("./version");
const compress_1 = require("./compress");
const module_mapper_1 = require("./module-mapper");
const data_1 = require("./data");
const sourcemap_1 = require("./sourcemap");
const build_stats_1 = require("./build-stats");
const WARN_SOURCEMAP_DISABLED = "rollup output configuration missing sourcemap = true. You should add output.sourcemap = true or disable sourcemap in this plugin";
const WARN_SOURCEMAP_MISSING = (id) => `${id} missing source map`;
const defaultSizeGetter = () => Promise.resolve(0);
const visualizer = (opts = {}) => {
    return {
        name: "visualizer",
        async generateBundle(outputOptions, outputBundle) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            opts = typeof opts === "function" ? opts(outputOptions) : opts;
            const json = !!opts.json;
            const filename = (_a = opts.filename) !== null && _a !== void 0 ? _a : (json ? "stats.json" : "stats.html");
            const title = (_b = opts.title) !== null && _b !== void 0 ? _b : "RollUp Visualizer";
            const open = !!opts.open;
            const openOptions = (_c = opts.openOptions) !== null && _c !== void 0 ? _c : {};
            const template = (_d = opts.template) !== null && _d !== void 0 ? _d : "treemap";
            const projectRoot = (_e = opts.projectRoot) !== null && _e !== void 0 ? _e : process.cwd();
            const gzipSize = !!opts.gzipSize;
            const brotliSize = !!opts.brotliSize;
            const gzipSizeGetter = gzipSize
                ? (0, compress_1.createGzipSizeGetter)(typeof opts.gzipSize === "object" ? opts.gzipSize : {})
                : defaultSizeGetter;
            const brotliSizeGetter = brotliSize
                ? (0, compress_1.createBrotliSizeGetter)(typeof opts.brotliSize === "object" ? opts.brotliSize : {})
                : defaultSizeGetter;
            const ModuleLengths = async ({ id, renderedLength, code, }) => {
                const result = {
                    id,
                    gzipLength: code == null || code == "" ? 0 : await gzipSizeGetter(code),
                    brotliLength: code == null || code == "" ? 0 : await brotliSizeGetter(code),
                    renderedLength: code == null || code == "" ? renderedLength : Buffer.byteLength(code, "utf-8"),
                };
                return result;
            };
            if (opts.sourcemap && !outputOptions.sourcemap) {
                this.warn(WARN_SOURCEMAP_DISABLED);
            }
            const roots = [];
            const mapper = new module_mapper_1.ModuleMapper(projectRoot);
            // collect trees
            for (const [bundleId, bundle] of Object.entries(outputBundle)) {
                if (bundle.type !== "chunk")
                    continue; //only chunks
                let tree;
                if (opts.sourcemap) {
                    if (!bundle.map) {
                        this.warn(WARN_SOURCEMAP_MISSING(bundleId));
                    }
                    const modules = await (0, sourcemap_1.getSourcemapModules)(bundleId, bundle, (_g = (_f = outputOptions.dir) !== null && _f !== void 0 ? _f : (outputOptions.file && path_1.default.dirname(outputOptions.file))) !== null && _g !== void 0 ? _g : process.cwd());
                    const moduleRenderInfo = await Promise.all(Object.values(modules).map(({ id, renderedLength }) => {
                        var _a;
                        const code = (_a = bundle.modules[id]) === null || _a === void 0 ? void 0 : _a.code;
                        return ModuleLengths({ id, renderedLength, code });
                    }));
                    tree = (0, data_1.buildTree)(bundleId, moduleRenderInfo, mapper);
                }
                else {
                    const modules = await Promise.all(Object.entries(bundle.modules).map(([id, { renderedLength, code }]) => ModuleLengths({ id, renderedLength, code })));
                    tree = (0, data_1.buildTree)(bundleId, modules, mapper);
                }
                if (tree.children.length === 0) {
                    const bundleSizes = await ModuleLengths({
                        id: bundleId,
                        renderedLength: bundle.code.length,
                        code: bundle.code,
                    });
                    const facadeModuleId = (_h = bundle.facadeModuleId) !== null && _h !== void 0 ? _h : `${bundleId}-unknown`;
                    const bundleUid = mapper.setNodePart(bundleId, facadeModuleId, bundleSizes);
                    mapper.setNodeMeta(facadeModuleId, { isEntry: true });
                    const leaf = { name: bundleId, uid: bundleUid };
                    roots.push(leaf);
                }
                else {
                    roots.push(tree);
                }
            }
            // after trees we process links (this is mostly for uids)
            for (const [, bundle] of Object.entries(outputBundle)) {
                if (bundle.type !== "chunk" || bundle.facadeModuleId == null)
                    continue; //only chunks
                (0, data_1.addLinks)(bundle.facadeModuleId, this.getModuleInfo.bind(this), mapper);
            }
            const tree = (0, data_1.mergeTrees)(roots);
            const data = {
                version: version_1.version,
                tree,
                nodeParts: mapper.getNodeParts(),
                nodeMetas: mapper.getNodeMetas(),
                env: {
                    rollup: this.meta.rollupVersion,
                },
                options: {
                    gzip: gzipSize,
                    brotli: brotliSize,
                    sourcemap: !!opts.sourcemap,
                },
            };
            const fileContent = json
                ? JSON.stringify(data, null, 2)
                : await (0, build_stats_1.buildHtml)({
                    title,
                    data,
                    template,
                });
            await fs_1.promises.mkdir(path_1.default.dirname(filename), { recursive: true });
            await fs_1.promises.writeFile(filename, fileContent);
            if (open) {
                await (0, open_1.default)(filename, openOptions);
            }
        },
    };
};
exports.visualizer = visualizer;
exports.default = exports.visualizer;

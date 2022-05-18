"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Job = exports.nodeFileTrace = void 0;
const path_1 = require("path");
const graceful_fs_1 = __importDefault(require("graceful-fs"));
const analyze_1 = __importDefault(require("./analyze"));
const resolve_dependency_1 = __importDefault(require("./resolve-dependency"));
const micromatch_1 = require("micromatch");
const sharedlib_emit_1 = require("./utils/sharedlib-emit");
const path_2 = require("path");
const fsReadFile = graceful_fs_1.default.promises.readFile;
const fsReadlink = graceful_fs_1.default.promises.readlink;
const fsStat = graceful_fs_1.default.promises.stat;
function inPath(path, parent) {
    const pathWithSep = path_2.join(parent, path_1.sep);
    return path.startsWith(pathWithSep) && path !== pathWithSep;
}
async function nodeFileTrace(files, opts = {}) {
    const job = new Job(opts);
    if (opts.readFile)
        job.readFile = opts.readFile;
    if (opts.stat)
        job.stat = opts.stat;
    if (opts.readlink)
        job.readlink = opts.readlink;
    if (opts.resolve)
        job.resolve = opts.resolve;
    job.ts = true;
    await Promise.all(files.map(async (file) => {
        const path = path_1.resolve(file);
        await job.emitFile(path, 'initial');
        if (path.endsWith('.js') || path.endsWith('.cjs') || path.endsWith('.mjs') || path.endsWith('.node') || job.ts && (path.endsWith('.ts') || path.endsWith('.tsx'))) {
            return job.emitDependency(path);
        }
        return undefined;
    }));
    const result = {
        fileList: job.fileList,
        esmFileList: job.esmFileList,
        reasons: job.reasons,
        warnings: job.warnings
    };
    return result;
}
exports.nodeFileTrace = nodeFileTrace;
;
class Job {
    constructor({ base = process.cwd(), processCwd, exports, conditions = exports || ['node'], exportsOnly = false, paths = {}, ignore, log = false, mixedModules = false, ts = true, analysis = {}, cache, }) {
        this.reasons = new Map();
        this.ts = ts;
        base = path_1.resolve(base);
        this.ignoreFn = (path) => {
            if (path.startsWith('..' + path_1.sep))
                return true;
            return false;
        };
        if (typeof ignore === 'string')
            ignore = [ignore];
        if (typeof ignore === 'function') {
            const ig = ignore;
            this.ignoreFn = (path) => {
                if (path.startsWith('..' + path_1.sep))
                    return true;
                if (ig(path))
                    return true;
                return false;
            };
        }
        else if (Array.isArray(ignore)) {
            const resolvedIgnores = ignore.map(ignore => path_1.relative(base, path_1.resolve(base || process.cwd(), ignore)));
            this.ignoreFn = (path) => {
                if (path.startsWith('..' + path_1.sep))
                    return true;
                if (micromatch_1.isMatch(path, resolvedIgnores))
                    return true;
                return false;
            };
        }
        this.base = base;
        this.cwd = path_1.resolve(processCwd || base);
        this.conditions = conditions;
        this.exportsOnly = exportsOnly;
        const resolvedPaths = {};
        for (const path of Object.keys(paths)) {
            const trailer = paths[path].endsWith('/');
            const resolvedPath = path_1.resolve(base, paths[path]);
            resolvedPaths[path] = resolvedPath + (trailer ? '/' : '');
        }
        this.paths = resolvedPaths;
        this.log = log;
        this.mixedModules = mixedModules;
        this.analysis = {};
        if (analysis !== false) {
            Object.assign(this.analysis, {
                // whether to glob any analysis like __dirname + '/dir/' or require('x/' + y)
                // that might output any file in a directory
                emitGlobs: true,
                // whether __filename and __dirname style
                // expressions should be analyzed as file references
                computeFileReferences: true,
                // evaluate known bindings to assist with glob and file reference analysis
                evaluatePureExpressions: true,
            }, analysis === true ? {} : analysis);
        }
        this.fileCache = cache && cache.fileCache || new Map();
        this.statCache = cache && cache.statCache || new Map();
        this.symlinkCache = cache && cache.symlinkCache || new Map();
        this.analysisCache = cache && cache.analysisCache || new Map();
        if (cache) {
            cache.fileCache = this.fileCache;
            cache.statCache = this.statCache;
            cache.symlinkCache = this.symlinkCache;
            cache.analysisCache = this.analysisCache;
        }
        this.fileList = new Set();
        this.esmFileList = new Set();
        this.processed = new Set();
        this.warnings = new Set();
    }
    async readlink(path) {
        const cached = this.symlinkCache.get(path);
        if (cached !== undefined)
            return cached;
        try {
            const link = await fsReadlink(path);
            // also copy stat cache to symlink
            const stats = this.statCache.get(path);
            if (stats)
                this.statCache.set(path_1.resolve(path, link), stats);
            this.symlinkCache.set(path, link);
            return link;
        }
        catch (e) {
            if (e.code !== 'EINVAL' && e.code !== 'ENOENT' && e.code !== 'UNKNOWN')
                throw e;
            this.symlinkCache.set(path, null);
            return null;
        }
    }
    async isFile(path) {
        const stats = await this.stat(path);
        if (stats)
            return stats.isFile();
        return false;
    }
    async isDir(path) {
        const stats = await this.stat(path);
        if (stats)
            return stats.isDirectory();
        return false;
    }
    async stat(path) {
        const cached = this.statCache.get(path);
        if (cached)
            return cached;
        try {
            const stats = await fsStat(path);
            this.statCache.set(path, stats);
            return stats;
        }
        catch (e) {
            if (e.code === 'ENOENT') {
                this.statCache.set(path, null);
                return null;
            }
            throw e;
        }
    }
    async resolve(id, parent, job, cjsResolve) {
        return resolve_dependency_1.default(id, parent, job, cjsResolve);
    }
    async readFile(path) {
        const cached = this.fileCache.get(path);
        if (cached !== undefined)
            return cached;
        try {
            const source = (await fsReadFile(path)).toString();
            this.fileCache.set(path, source);
            return source;
        }
        catch (e) {
            if (e.code === 'ENOENT' || e.code === 'EISDIR') {
                this.fileCache.set(path, null);
                return null;
            }
            throw e;
        }
    }
    async realpath(path, parent, seen = new Set()) {
        if (seen.has(path))
            throw new Error('Recursive symlink detected resolving ' + path);
        seen.add(path);
        const symlink = await this.readlink(path);
        // emit direct symlink paths only
        if (symlink) {
            const parentPath = path_1.dirname(path);
            const resolved = path_1.resolve(parentPath, symlink);
            const realParent = await this.realpath(parentPath, parent);
            if (inPath(path, realParent))
                await this.emitFile(path, 'resolve', parent, true);
            return this.realpath(resolved, parent, seen);
        }
        // keep backtracking for realpath, emitting folder symlinks within base
        if (!inPath(path, this.base))
            return path;
        return path_2.join(await this.realpath(path_1.dirname(path), parent, seen), path_1.basename(path));
    }
    async emitFile(path, reasonType, parent, isRealpath = false) {
        if (!isRealpath) {
            path = await this.realpath(path, parent);
        }
        path = path_1.relative(this.base, path);
        if (parent) {
            parent = path_1.relative(this.base, parent);
        }
        let reasonEntry = this.reasons.get(path);
        if (!reasonEntry) {
            reasonEntry = {
                type: [reasonType],
                ignored: false,
                parents: new Set()
            };
            this.reasons.set(path, reasonEntry);
        }
        else if (!reasonEntry.type.includes(reasonType)) {
            reasonEntry.type.push(reasonType);
        }
        if (parent && this.ignoreFn(path, parent)) {
            if (!this.fileList.has(path) && reasonEntry) {
                reasonEntry.ignored = true;
            }
            return false;
        }
        if (parent) {
            reasonEntry.parents.add(parent);
        }
        this.fileList.add(path);
        return true;
    }
    async getPjsonBoundary(path) {
        const rootSeparatorIndex = path.indexOf(path_1.sep);
        let separatorIndex;
        while ((separatorIndex = path.lastIndexOf(path_1.sep)) > rootSeparatorIndex) {
            path = path.slice(0, separatorIndex);
            if (await this.isFile(path + path_1.sep + 'package.json'))
                return path;
        }
        return undefined;
    }
    async emitDependency(path, parent) {
        if (this.processed.has(path)) {
            if (parent) {
                await this.emitFile(path, 'dependency', parent);
            }
            return;
        }
        ;
        this.processed.add(path);
        const emitted = await this.emitFile(path, 'dependency', parent);
        if (!emitted)
            return;
        if (path.endsWith('.json'))
            return;
        if (path.endsWith('.node'))
            return await sharedlib_emit_1.sharedLibEmit(path, this);
        // js files require the "type": "module" lookup, so always emit the package.json
        if (path.endsWith('.js')) {
            const pjsonBoundary = await this.getPjsonBoundary(path);
            if (pjsonBoundary)
                await this.emitFile(pjsonBoundary + path_1.sep + 'package.json', 'resolve', path);
        }
        let analyzeResult;
        const cachedAnalysis = this.analysisCache.get(path);
        if (cachedAnalysis) {
            analyzeResult = cachedAnalysis;
        }
        else {
            const source = await this.readFile(path);
            if (source === null)
                throw new Error('File ' + path + ' does not exist.');
            analyzeResult = await analyze_1.default(path, source.toString(), this);
            this.analysisCache.set(path, analyzeResult);
        }
        const { deps, imports, assets, isESM } = analyzeResult;
        if (isESM)
            this.esmFileList.add(path_1.relative(this.base, path));
        await Promise.all([
            ...[...assets].map(async (asset) => {
                const ext = path_1.extname(asset);
                if (ext === '.js' || ext === '.mjs' || ext === '.node' || ext === '' ||
                    this.ts && (ext === '.ts' || ext === '.tsx') && asset.startsWith(this.base) && asset.slice(this.base.length).indexOf(path_1.sep + 'node_modules' + path_1.sep) === -1)
                    await this.emitDependency(asset, path);
                else
                    await this.emitFile(asset, 'asset', path);
            }),
            ...[...deps].map(async (dep) => {
                try {
                    var resolved = await this.resolve(dep, path, this, !isESM);
                }
                catch (e) {
                    this.warnings.add(new Error(`Failed to resolve dependency ${dep}:\n${e && e.message}`));
                    return;
                }
                if (Array.isArray(resolved)) {
                    for (const item of resolved) {
                        // ignore builtins
                        if (item.startsWith('node:'))
                            return;
                        await this.emitDependency(item, path);
                    }
                }
                else {
                    // ignore builtins
                    if (resolved.startsWith('node:'))
                        return;
                    await this.emitDependency(resolved, path);
                }
            }),
            ...[...imports].map(async (dep) => {
                try {
                    var resolved = await this.resolve(dep, path, this, false);
                }
                catch (e) {
                    this.warnings.add(new Error(`Failed to resolve dependency ${dep}:\n${e && e.message}`));
                    return;
                }
                if (Array.isArray(resolved)) {
                    for (const item of resolved) {
                        // ignore builtins
                        if (item.startsWith('node:'))
                            return;
                        await this.emitDependency(item, path);
                    }
                }
                else {
                    // ignore builtins
                    if (resolved.startsWith('node:'))
                        return;
                    await this.emitDependency(resolved, path);
                }
            })
        ]);
    }
}
exports.Job = Job;

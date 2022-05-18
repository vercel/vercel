"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
// node resolver
// custom implementation to emit only needed package.json files for resolver
// (package.json files are emitted as they are hit)
async function resolveDependency(specifier, parent, job, cjsResolve = true) {
    let resolved;
    if (path_1.isAbsolute(specifier) || specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
        const trailingSlash = specifier.endsWith('/');
        resolved = await resolvePath(path_1.resolve(parent, '..', specifier) + (trailingSlash ? '/' : ''), parent, job);
    }
    else if (specifier[0] === '#') {
        resolved = await packageImportsResolve(specifier, parent, job, cjsResolve);
    }
    else {
        resolved = await resolvePackage(specifier, parent, job, cjsResolve);
    }
    if (Array.isArray(resolved)) {
        return Promise.all(resolved.map(resolved => job.realpath(resolved, parent)));
    }
    else if (resolved.startsWith('node:')) {
        return resolved;
    }
    else {
        return job.realpath(resolved, parent);
    }
}
exports.default = resolveDependency;
;
async function resolvePath(path, parent, job) {
    const result = await resolveFile(path, parent, job) || await resolveDir(path, parent, job);
    if (!result) {
        throw new NotFoundError(path, parent);
    }
    return result;
}
async function resolveFile(path, parent, job) {
    if (path.endsWith('/'))
        return undefined;
    path = await job.realpath(path, parent);
    if (await job.isFile(path))
        return path;
    if (job.ts && path.startsWith(job.base) && path.slice(job.base.length).indexOf(path_1.sep + 'node_modules' + path_1.sep) === -1 && await job.isFile(path + '.ts'))
        return path + '.ts';
    if (job.ts && path.startsWith(job.base) && path.slice(job.base.length).indexOf(path_1.sep + 'node_modules' + path_1.sep) === -1 && await job.isFile(path + '.tsx'))
        return path + '.tsx';
    if (await job.isFile(path + '.js'))
        return path + '.js';
    if (await job.isFile(path + '.json'))
        return path + '.json';
    if (await job.isFile(path + '.node'))
        return path + '.node';
    return undefined;
}
async function resolveDir(path, parent, job) {
    if (path.endsWith('/'))
        path = path.slice(0, -1);
    if (!await job.isDir(path))
        return;
    const pkgCfg = await getPkgCfg(path, job);
    if (pkgCfg && typeof pkgCfg.main === 'string') {
        const resolved = await resolveFile(path_1.resolve(path, pkgCfg.main), parent, job) || await resolveFile(path_1.resolve(path, pkgCfg.main, 'index'), parent, job);
        if (resolved) {
            await job.emitFile(path + path_1.sep + 'package.json', 'resolve', parent);
            return resolved;
        }
    }
    return resolveFile(path_1.resolve(path, 'index'), parent, job);
}
class NotFoundError extends Error {
    constructor(specifier, parent) {
        super("Cannot find module '" + specifier + "' loaded from " + parent);
        this.code = 'MODULE_NOT_FOUND';
    }
}
const nodeBuiltins = new Set([...require("repl")._builtinLibs, "constants", "module", "timers", "console", "_stream_writable", "_stream_readable", "_stream_duplex", "process", "sys"]);
function getPkgName(name) {
    const segments = name.split('/');
    if (name[0] === '@' && segments.length > 1)
        return segments.length > 1 ? segments.slice(0, 2).join('/') : null;
    return segments.length ? segments[0] : null;
}
async function getPkgCfg(pkgPath, job) {
    const pjsonSource = await job.readFile(pkgPath + path_1.sep + 'package.json');
    if (pjsonSource) {
        try {
            return JSON.parse(pjsonSource.toString());
        }
        catch (e) { }
    }
    return undefined;
}
function getExportsTarget(exports, conditions, cjsResolve) {
    if (typeof exports === 'string') {
        return exports;
    }
    else if (exports === null) {
        return exports;
    }
    else if (Array.isArray(exports)) {
        for (const item of exports) {
            const target = getExportsTarget(item, conditions, cjsResolve);
            if (target === null || typeof target === 'string' && target.startsWith('./'))
                return target;
        }
    }
    else if (typeof exports === 'object') {
        for (const condition of Object.keys(exports)) {
            if (condition === 'default' ||
                condition === 'require' && cjsResolve ||
                condition === 'import' && !cjsResolve ||
                conditions.includes(condition)) {
                const target = getExportsTarget(exports[condition], conditions, cjsResolve);
                if (target !== undefined)
                    return target;
            }
        }
    }
    return undefined;
}
function resolveExportsImports(pkgPath, obj, subpath, job, isImports, cjsResolve) {
    let matchObj;
    if (isImports) {
        if (!(typeof obj === 'object' && !Array.isArray(obj) && obj !== null))
            return undefined;
        matchObj = obj;
    }
    else if (typeof obj === 'string' || Array.isArray(obj) || obj === null ||
        typeof obj === 'object' && Object.keys(obj).length && Object.keys(obj)[0][0] !== '.') {
        matchObj = { '.': obj };
    }
    else {
        matchObj = obj;
    }
    if (subpath in matchObj) {
        const target = getExportsTarget(matchObj[subpath], job.conditions, cjsResolve);
        if (typeof target === 'string' && target.startsWith('./'))
            return pkgPath + target.slice(1);
    }
    for (const match of Object.keys(matchObj).sort((a, b) => b.length - a.length)) {
        if (match.endsWith('*') && subpath.startsWith(match.slice(0, -1))) {
            const target = getExportsTarget(matchObj[match], job.conditions, cjsResolve);
            if (typeof target === 'string' && target.startsWith('./'))
                return pkgPath + target.slice(1).replace(/\*/g, subpath.slice(match.length - 1));
        }
        if (!match.endsWith('/'))
            continue;
        if (subpath.startsWith(match)) {
            const target = getExportsTarget(matchObj[match], job.conditions, cjsResolve);
            if (typeof target === 'string' && target.endsWith('/') && target.startsWith('./'))
                return pkgPath + target.slice(1) + subpath.slice(match.length);
        }
    }
    return undefined;
}
async function packageImportsResolve(name, parent, job, cjsResolve) {
    if (name !== '#' && !name.startsWith('#/') && job.conditions) {
        const pjsonBoundary = await job.getPjsonBoundary(parent);
        if (pjsonBoundary) {
            const pkgCfg = await getPkgCfg(pjsonBoundary, job);
            const { imports: pkgImports } = pkgCfg || {};
            if (pkgCfg && pkgImports !== null && pkgImports !== undefined) {
                let importsResolved = resolveExportsImports(pjsonBoundary, pkgImports, name, job, true, cjsResolve);
                if (importsResolved) {
                    if (cjsResolve)
                        importsResolved = await resolveFile(importsResolved, parent, job) || await resolveDir(importsResolved, parent, job);
                    else if (!await job.isFile(importsResolved))
                        throw new NotFoundError(importsResolved, parent);
                    if (importsResolved) {
                        await job.emitFile(pjsonBoundary + path_1.sep + 'package.json', 'resolve', parent);
                        return importsResolved;
                    }
                }
            }
        }
    }
    throw new NotFoundError(name, parent);
}
async function resolvePackage(name, parent, job, cjsResolve) {
    let packageParent = parent;
    if (nodeBuiltins.has(name))
        return 'node:' + name;
    const pkgName = getPkgName(name) || '';
    // package own name resolution
    let selfResolved;
    if (job.conditions) {
        const pjsonBoundary = await job.getPjsonBoundary(parent);
        if (pjsonBoundary) {
            const pkgCfg = await getPkgCfg(pjsonBoundary, job);
            const { exports: pkgExports } = pkgCfg || {};
            if (pkgCfg && pkgCfg.name && pkgCfg.name === pkgName && pkgExports !== null && pkgExports !== undefined) {
                selfResolved = resolveExportsImports(pjsonBoundary, pkgExports, '.' + name.slice(pkgName.length), job, false, cjsResolve);
                if (selfResolved) {
                    if (cjsResolve)
                        selfResolved = await resolveFile(selfResolved, parent, job) || await resolveDir(selfResolved, parent, job);
                    else if (!await job.isFile(selfResolved))
                        throw new NotFoundError(selfResolved, parent);
                }
                if (selfResolved)
                    await job.emitFile(pjsonBoundary + path_1.sep + 'package.json', 'resolve', parent);
            }
        }
    }
    let separatorIndex;
    const rootSeparatorIndex = packageParent.indexOf(path_1.sep);
    while ((separatorIndex = packageParent.lastIndexOf(path_1.sep)) > rootSeparatorIndex) {
        packageParent = packageParent.slice(0, separatorIndex);
        const nodeModulesDir = packageParent + path_1.sep + 'node_modules';
        const stat = await job.stat(nodeModulesDir);
        if (!stat || !stat.isDirectory())
            continue;
        const pkgCfg = await getPkgCfg(nodeModulesDir + path_1.sep + pkgName, job);
        const { exports: pkgExports } = pkgCfg || {};
        if (job.conditions && pkgExports !== undefined && pkgExports !== null && !selfResolved) {
            let legacyResolved;
            if (!job.exportsOnly)
                legacyResolved = await resolveFile(nodeModulesDir + path_1.sep + name, parent, job) || await resolveDir(nodeModulesDir + path_1.sep + name, parent, job);
            let resolved = resolveExportsImports(nodeModulesDir + path_1.sep + pkgName, pkgExports, '.' + name.slice(pkgName.length), job, false, cjsResolve);
            if (resolved) {
                if (cjsResolve)
                    resolved = await resolveFile(resolved, parent, job) || await resolveDir(resolved, parent, job);
                else if (!await job.isFile(resolved))
                    throw new NotFoundError(resolved, parent);
            }
            if (resolved) {
                await job.emitFile(nodeModulesDir + path_1.sep + pkgName + path_1.sep + 'package.json', 'resolve', parent);
                if (legacyResolved && legacyResolved !== resolved)
                    return [resolved, legacyResolved];
                return resolved;
            }
            if (legacyResolved)
                return legacyResolved;
        }
        else {
            const resolved = await resolveFile(nodeModulesDir + path_1.sep + name, parent, job) || await resolveDir(nodeModulesDir + path_1.sep + name, parent, job);
            if (resolved) {
                if (selfResolved && selfResolved !== resolved)
                    return [resolved, selfResolved];
                return resolved;
            }
        }
    }
    if (selfResolved)
        return selfResolved;
    if (Object.hasOwnProperty.call(job.paths, name)) {
        return job.paths[name];
    }
    for (const path of Object.keys(job.paths)) {
        if (path.endsWith('/') && name.startsWith(path)) {
            const pathTarget = job.paths[path] + name.slice(path.length);
            const resolved = await resolveFile(pathTarget, parent, job) || await resolveDir(pathTarget, parent, job);
            if (!resolved) {
                throw new NotFoundError(name, parent);
            }
            return resolved;
        }
    }
    throw new NotFoundError(name, parent);
}

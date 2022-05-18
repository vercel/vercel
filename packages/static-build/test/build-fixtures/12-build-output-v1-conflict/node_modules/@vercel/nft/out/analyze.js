"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const rollup_pluginutils_1 = require("rollup-pluginutils");
const static_eval_1 = require("./utils/static-eval");
const acorn_1 = require("acorn");
const bindings_1 = __importDefault(require("bindings"));
const ast_helpers_1 = require("./utils/ast-helpers");
const glob_1 = __importDefault(require("glob"));
const get_package_base_1 = require("./utils/get-package-base");
const binary_locators_1 = require("./utils/binary-locators");
const interop_require_1 = require("./utils/interop-require");
const special_cases_1 = __importDefault(require("./utils/special-cases"));
const resolve_dependency_js_1 = __importDefault(require("./resolve-dependency.js"));
//@ts-ignore
const node_gyp_build_1 = __importDefault(require("node-gyp-build"));
//@ts-ignore
const node_pre_gyp_1 = __importDefault(require("@mapbox/node-pre-gyp"));
const url_1 = require("url");
// TypeScript fails to resolve estree-walker to the top due to the conflicting
// estree-walker version in rollup-pluginutils so we use require here instead
const asyncWalk = require('estree-walker').asyncWalk;
// Note: these should be deprecated over time as they ship in Acorn core
const acorn = acorn_1.Parser.extend(
//require("acorn-class-fields"),
//require("acorn-static-class-features"),
//require("acorn-private-class-elements")
);
const os_1 = __importDefault(require("os"));
const wrappers_1 = require("./utils/wrappers");
const resolve_from_1 = __importDefault(require("resolve-from"));
const staticProcess = {
    cwd: () => {
        return cwd;
    },
    env: {
        NODE_ENV: static_eval_1.UNKNOWN,
        [static_eval_1.UNKNOWN]: true
    },
    [static_eval_1.UNKNOWN]: true
};
// unique symbol value to identify express instance in static analysis
const EXPRESS_SET = Symbol();
const EXPRESS_ENGINE = Symbol();
const NBIND_INIT = Symbol();
const SET_ROOT_DIR = Symbol();
const PKG_INFO = Symbol();
const FS_FN = Symbol();
const FS_DIR_FN = Symbol();
const BINDINGS = Symbol();
const NODE_GYP_BUILD = Symbol();
const fsSymbols = {
    access: FS_FN,
    accessSync: FS_FN,
    createReadStream: FS_FN,
    exists: FS_FN,
    existsSync: FS_FN,
    fstat: FS_FN,
    fstatSync: FS_FN,
    lstat: FS_FN,
    lstatSync: FS_FN,
    open: FS_FN,
    readdir: FS_DIR_FN,
    readdirSync: FS_DIR_FN,
    readFile: FS_FN,
    readFileSync: FS_FN,
    stat: FS_FN,
    statSync: FS_FN
};
const staticModules = Object.assign(Object.create(null), {
    bindings: {
        default: BINDINGS
    },
    express: {
        default: function () {
            return {
                [static_eval_1.UNKNOWN]: true,
                set: EXPRESS_SET,
                engine: EXPRESS_ENGINE
            };
        }
    },
    fs: Object.assign({ default: fsSymbols }, fsSymbols),
    process: Object.assign({ default: staticProcess }, staticProcess),
    // populated below
    path: {
        default: {}
    },
    os: Object.assign({ default: os_1.default }, os_1.default),
    '@mapbox/node-pre-gyp': Object.assign({ default: node_pre_gyp_1.default }, node_pre_gyp_1.default),
    'node-pre-gyp': binary_locators_1.pregyp,
    'node-pre-gyp/lib/pre-binding': binary_locators_1.pregyp,
    'node-pre-gyp/lib/pre-binding.js': binary_locators_1.pregyp,
    'node-gyp-build': {
        default: NODE_GYP_BUILD
    },
    'nbind': {
        init: NBIND_INIT,
        default: {
            init: NBIND_INIT
        }
    },
    'resolve-from': {
        default: resolve_from_1.default
    },
    'strong-globalize': {
        default: {
            SetRootDir: SET_ROOT_DIR
        },
        SetRootDir: SET_ROOT_DIR
    },
    'pkginfo': {
        default: PKG_INFO
    }
});
const globalBindings = {
    // Support for require calls generated from `import` statements by babel
    _interopRequireDefault: interop_require_1.normalizeDefaultRequire,
    _interopRequireWildcard: interop_require_1.normalizeWildcardRequire,
    // Support for require calls generated from `import` statements by tsc
    __importDefault: interop_require_1.normalizeDefaultRequire,
    __importStar: interop_require_1.normalizeWildcardRequire,
    MONGOOSE_DRIVER_PATH: undefined,
    URL: url_1.URL,
    Object: {
        assign: Object.assign
    }
};
globalBindings.global = globalBindings.GLOBAL = globalBindings.globalThis = globalBindings;
// call expression triggers
const TRIGGER = Symbol();
binary_locators_1.pregyp.find[TRIGGER] = true;
const staticPath = staticModules.path;
Object.keys(path_1.default).forEach(name => {
    const pathFn = path_1.default[name];
    if (typeof pathFn === 'function') {
        const fn = function mockPath() {
            return pathFn.apply(mockPath, arguments);
        };
        fn[TRIGGER] = true;
        staticPath[name] = staticPath.default[name] = fn;
    }
    else {
        staticPath[name] = staticPath.default[name] = pathFn;
    }
});
// overload path.resolve to support custom cwd
staticPath.resolve = staticPath.default.resolve = function (...args) {
    return path_1.default.resolve.apply(this, [cwd, ...args]);
};
staticPath.resolve[TRIGGER] = true;
const excludeAssetExtensions = new Set(['.h', '.cmake', '.c', '.cpp']);
const excludeAssetFiles = new Set(['CHANGELOG.md', 'README.md', 'readme.md', 'changelog.md']);
let cwd;
const absoluteRegEx = /^\/[^\/]+|^[a-z]:[\\/][^\\/]+/i;
function isAbsolutePathOrUrl(str) {
    if (str instanceof url_1.URL)
        return str.protocol === 'file:';
    if (typeof str === 'string') {
        if (str.startsWith('file:')) {
            try {
                new url_1.URL(str);
                return true;
            }
            catch (_a) {
                return false;
            }
        }
        return absoluteRegEx.test(str);
    }
    return false;
}
const BOUND_REQUIRE = Symbol();
const repeatGlobRegEx = /([\/\\]\*\*[\/\\]\*)+/g;
;
async function analyze(id, code, job) {
    const assets = new Set();
    const deps = new Set();
    const imports = new Set();
    const dir = path_1.default.dirname(id);
    // if (typeof options.production === 'boolean' && staticProcess.env.NODE_ENV === UNKNOWN)
    //  staticProcess.env.NODE_ENV = options.production ? 'production' : 'dev';
    cwd = job.cwd;
    const pkgBase = get_package_base_1.getPackageBase(id);
    const emitAssetDirectory = (wildcardPath) => {
        if (!job.analysis.emitGlobs)
            return;
        const wildcardIndex = wildcardPath.indexOf(static_eval_1.WILDCARD);
        const dirIndex = wildcardIndex === -1 ? wildcardPath.length : wildcardPath.lastIndexOf(path_1.default.sep, wildcardIndex);
        const assetDirPath = wildcardPath.substring(0, dirIndex);
        const patternPath = wildcardPath.slice(dirIndex);
        const wildcardPattern = patternPath.replace(static_eval_1.wildcardRegEx, (_match, index) => {
            return patternPath[index - 1] === path_1.default.sep ? '**/*' : '*';
        }).replace(repeatGlobRegEx, '/**/*') || '/**/*';
        if (job.ignoreFn(path_1.default.relative(job.base, assetDirPath + wildcardPattern)))
            return;
        assetEmissionPromises = assetEmissionPromises.then(async () => {
            if (job.log)
                console.log('Globbing ' + assetDirPath + wildcardPattern);
            const files = (await new Promise((resolve, reject) => glob_1.default(assetDirPath + wildcardPattern, { mark: true, ignore: assetDirPath + '/**/node_modules/**/*' }, (err, files) => err ? reject(err) : resolve(files))));
            files
                .filter(name => !excludeAssetExtensions.has(path_1.default.extname(name)) &&
                !excludeAssetFiles.has(path_1.default.basename(name)) &&
                !name.endsWith('/'))
                .forEach(file => assets.add(file));
        });
    };
    let assetEmissionPromises = Promise.resolve();
    // remove shebang
    code = code.replace(/^#![^\n\r]*[\r\n]/, '');
    let ast;
    let isESM = false;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
        isESM = false;
    }
    catch (e) {
        const isModule = e && e.message && e.message.includes('sourceType: module');
        if (!isModule) {
            job.warnings.add(new Error(`Failed to parse ${id} as script:\n${e && e.message}`));
        }
    }
    //@ts-ignore
    if (!ast) {
        try {
            ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });
            isESM = true;
        }
        catch (e) {
            job.warnings.add(new Error(`Failed to parse ${id} as module:\n${e && e.message}`));
            // Parser errors just skip analysis
            return { assets, deps, imports, isESM: false };
        }
    }
    const importMetaUrl = url_1.pathToFileURL(id).href;
    const knownBindings = Object.assign(Object.create(null), {
        __dirname: {
            shadowDepth: 0,
            value: { value: path_1.default.resolve(id, '..') }
        },
        __filename: {
            shadowDepth: 0,
            value: { value: id }
        },
        process: {
            shadowDepth: 0,
            value: { value: staticProcess }
        }
    });
    if (!isESM || job.mixedModules) {
        knownBindings.require = {
            shadowDepth: 0,
            value: {
                value: {
                    [static_eval_1.FUNCTION](specifier) {
                        deps.add(specifier);
                        const m = staticModules[specifier];
                        return m.default;
                    },
                    resolve(specifier) {
                        return resolve_dependency_js_1.default(specifier, id, job);
                    }
                }
            }
        };
        knownBindings.require.value.value.resolve[TRIGGER] = true;
    }
    function setKnownBinding(name, value) {
        // require is somewhat special in that we shadow it but don't
        // statically analyze it ("known unknown" of sorts)
        if (name === 'require')
            return;
        knownBindings[name] = {
            shadowDepth: 0,
            value: value
        };
    }
    function getKnownBinding(name) {
        const binding = knownBindings[name];
        if (binding) {
            if (binding.shadowDepth === 0) {
                return binding.value;
            }
        }
        return undefined;
    }
    function hasKnownBindingValue(name) {
        const binding = knownBindings[name];
        return binding && binding.shadowDepth === 0;
    }
    if ((isESM || job.mixedModules) && isAst(ast)) {
        for (const decl of ast.body) {
            if (decl.type === 'ImportDeclaration') {
                const source = String(decl.source.value);
                deps.add(source);
                const staticModule = staticModules[source];
                if (staticModule) {
                    for (const impt of decl.specifiers) {
                        if (impt.type === 'ImportNamespaceSpecifier')
                            setKnownBinding(impt.local.name, { value: staticModule });
                        else if (impt.type === 'ImportDefaultSpecifier' && 'default' in staticModule)
                            setKnownBinding(impt.local.name, { value: staticModule.default });
                        else if (impt.type === 'ImportSpecifier' && impt.imported.name in staticModule)
                            setKnownBinding(impt.local.name, { value: staticModule[impt.imported.name] });
                    }
                }
            }
            else if (decl.type === 'ExportNamedDeclaration' || decl.type === 'ExportAllDeclaration') {
                if (decl.source)
                    deps.add(String(decl.source.value));
            }
        }
    }
    async function computePureStaticValue(expr, computeBranches = true) {
        const vars = Object.create(null);
        Object.keys(globalBindings).forEach(name => {
            vars[name] = { value: globalBindings[name] };
        });
        Object.keys(knownBindings).forEach(name => {
            vars[name] = getKnownBinding(name);
        });
        vars['import.meta'] = { url: importMetaUrl };
        // evaluate returns undefined for non-statically-analyzable
        const result = await static_eval_1.evaluate(expr, vars, computeBranches);
        return result;
    }
    // statically determinable leaves are tracked, and inlined when the
    // greatest parent statically known leaf computation corresponds to an asset path
    let staticChildNode;
    let staticChildValue;
    // Express engine opt-out
    let definedExpressEngines = false;
    function emitWildcardRequire(wildcardRequire) {
        if (!job.analysis.emitGlobs || !wildcardRequire.startsWith('./') && !wildcardRequire.startsWith('../'))
            return;
        wildcardRequire = path_1.default.resolve(dir, wildcardRequire);
        const wildcardIndex = wildcardRequire.indexOf(static_eval_1.WILDCARD);
        const dirIndex = wildcardIndex === -1 ? wildcardRequire.length : wildcardRequire.lastIndexOf(path_1.default.sep, wildcardIndex);
        const wildcardDirPath = wildcardRequire.substring(0, dirIndex);
        const patternPath = wildcardRequire.slice(dirIndex);
        let wildcardPattern = patternPath.replace(static_eval_1.wildcardRegEx, (_match, index) => {
            return patternPath[index - 1] === path_1.default.sep ? '**/*' : '*';
        }) || '/**/*';
        if (!wildcardPattern.endsWith('*'))
            wildcardPattern += '?(' + (job.ts ? '.ts|.tsx|' : '') + '.js|.json|.node)';
        if (job.ignoreFn(path_1.default.relative(job.base, wildcardDirPath + wildcardPattern)))
            return;
        assetEmissionPromises = assetEmissionPromises.then(async () => {
            if (job.log)
                console.log('Globbing ' + wildcardDirPath + wildcardPattern);
            const files = (await new Promise((resolve, reject) => glob_1.default(wildcardDirPath + wildcardPattern, { mark: true, ignore: wildcardDirPath + '/**/node_modules/**/*' }, (err, files) => err ? reject(err) : resolve(files))));
            files
                .filter(name => !excludeAssetExtensions.has(path_1.default.extname(name)) &&
                !excludeAssetFiles.has(path_1.default.basename(name)) &&
                !name.endsWith('/'))
                .forEach(file => assets.add(file));
        });
    }
    async function processRequireArg(expression, isImport = false) {
        if (expression.type === 'ConditionalExpression') {
            await processRequireArg(expression.consequent, isImport);
            await processRequireArg(expression.alternate, isImport);
            return;
        }
        if (expression.type === 'LogicalExpression') {
            await processRequireArg(expression.left, isImport);
            await processRequireArg(expression.right, isImport);
            return;
        }
        let computed = await computePureStaticValue(expression, true);
        if (!computed)
            return;
        if ('value' in computed && typeof computed.value === 'string') {
            if (!computed.wildcards)
                (isImport ? imports : deps).add(computed.value);
            else if (computed.wildcards.length >= 1)
                emitWildcardRequire(computed.value);
        }
        else {
            if ('then' in computed && typeof computed.then === 'string')
                (isImport ? imports : deps).add(computed.then);
            if ('else' in computed && typeof computed.else === 'string')
                (isImport ? imports : deps).add(computed.else);
        }
    }
    let scope = rollup_pluginutils_1.attachScopes(ast, 'scope');
    if (isAst(ast)) {
        wrappers_1.handleWrappers(ast);
        await special_cases_1.default({ id, ast, emitAsset: path => assets.add(path), emitAssetDirectory, job });
    }
    async function backtrack(parent, context) {
        // computing a static expression outward
        // -> compute and backtrack
        // Note that `context` can be undefined in `leave()`
        if (!staticChildNode)
            throw new Error('Internal error: No staticChildNode for backtrack.');
        const curStaticValue = await computePureStaticValue(parent, true);
        if (curStaticValue) {
            if ('value' in curStaticValue && typeof curStaticValue.value !== 'symbol' ||
                'then' in curStaticValue && typeof curStaticValue.then !== 'symbol' && typeof curStaticValue.else !== 'symbol') {
                staticChildValue = curStaticValue;
                staticChildNode = parent;
                if (context)
                    context.skip();
                return;
            }
        }
        // no static value -> see if we should emit the asset if it exists
        await emitStaticChildAsset();
    }
    await asyncWalk(ast, {
        async enter(_node, _parent) {
            var _a;
            const node = _node;
            const parent = _parent;
            if (node.scope) {
                scope = node.scope;
                for (const id in node.scope.declarations) {
                    if (id in knownBindings)
                        knownBindings[id].shadowDepth++;
                }
            }
            // currently backtracking
            if (staticChildNode)
                return;
            if (!parent)
                return;
            if (node.type === 'Identifier') {
                if (ast_helpers_1.isIdentifierRead(node, parent) && job.analysis.computeFileReferences) {
                    let binding;
                    // detect asset leaf expression triggers (if not already)
                    // __dirname,  __filename
                    if (typeof (binding = (_a = getKnownBinding(node.name)) === null || _a === void 0 ? void 0 : _a.value) === 'string' && binding.match(absoluteRegEx) ||
                        binding && (typeof binding === 'function' || typeof binding === 'object') && binding[TRIGGER]) {
                        staticChildValue = { value: typeof binding === 'string' ? binding : undefined };
                        staticChildNode = node;
                        await backtrack(parent, this);
                    }
                }
            }
            else if (job.analysis.computeFileReferences && node.type === 'MemberExpression' && node.object.type === 'MetaProperty' && node.object.meta.name === 'import' && node.object.property.name === 'meta' && (node.property.computed ? node.property.value : node.property.name) === 'url') {
                // import.meta.url leaf trigger
                staticChildValue = { value: importMetaUrl };
                staticChildNode = node;
                await backtrack(parent, this);
            }
            else if (node.type === 'ImportExpression') {
                await processRequireArg(node.source, true);
                return;
            }
            // Call expression cases and asset triggers
            // - fs triggers: fs.readFile(...)
            // - require.resolve()
            // - bindings()(...)
            // - nodegyp()
            // - etc.
            else if (node.type === 'CallExpression') {
                if ((!isESM || job.mixedModules) && node.callee.type === 'Identifier' && node.arguments.length) {
                    if (node.callee.name === 'require' && knownBindings.require.shadowDepth === 0) {
                        await processRequireArg(node.arguments[0]);
                        return;
                    }
                }
                else if ((!isESM || job.mixedModules) &&
                    node.callee.type === 'MemberExpression' &&
                    node.callee.object.type === 'Identifier' &&
                    node.callee.object.name === 'module' &&
                    'module' in knownBindings === false &&
                    node.callee.property.type === 'Identifier' &&
                    !node.callee.computed &&
                    node.callee.property.name === 'require' &&
                    node.arguments.length) {
                    await processRequireArg(node.arguments[0]);
                    return;
                }
                const calleeValue = job.analysis.evaluatePureExpressions && await computePureStaticValue(node.callee, false);
                // if we have a direct pure static function,
                // and that function has a [TRIGGER] symbol -> trigger asset emission from it
                if (calleeValue && 'value' in calleeValue && typeof calleeValue.value === 'function' && calleeValue.value[TRIGGER] && job.analysis.computeFileReferences) {
                    staticChildValue = await computePureStaticValue(node, true);
                    // if it computes, then we start backtracking
                    if (staticChildValue && parent) {
                        staticChildNode = node;
                        await backtrack(parent, this);
                    }
                }
                // handle well-known function symbol cases
                else if (calleeValue && 'value' in calleeValue && typeof calleeValue.value === 'symbol') {
                    switch (calleeValue.value) {
                        // customRequireWrapper('...')
                        case BOUND_REQUIRE:
                            if (node.arguments.length === 1 &&
                                node.arguments[0].type === 'Literal' &&
                                node.callee.type === 'Identifier' &&
                                knownBindings.require.shadowDepth === 0) {
                                await processRequireArg(node.arguments[0]);
                            }
                            break;
                        // require('bindings')(...)
                        case BINDINGS:
                            if (node.arguments.length) {
                                const arg = await computePureStaticValue(node.arguments[0], false);
                                if (arg && 'value' in arg && arg.value) {
                                    let opts;
                                    if (typeof arg.value === 'object')
                                        opts = arg.value;
                                    else if (typeof arg.value === 'string')
                                        opts = { bindings: arg.value };
                                    if (!opts.path) {
                                        opts.path = true;
                                    }
                                    opts.module_root = pkgBase;
                                    let resolved;
                                    try {
                                        resolved = bindings_1.default(opts);
                                    }
                                    catch (e) { }
                                    if (resolved) {
                                        staticChildValue = { value: resolved };
                                        staticChildNode = node;
                                        await emitStaticChildAsset();
                                    }
                                }
                            }
                            break;
                        case NODE_GYP_BUILD:
                            if (node.arguments.length === 1 && node.arguments[0].type === 'Identifier' &&
                                node.arguments[0].name === '__dirname' && knownBindings.__dirname.shadowDepth === 0) {
                                let resolved;
                                try {
                                    resolved = node_gyp_build_1.default.path(dir);
                                }
                                catch (e) { }
                                if (resolved) {
                                    staticChildValue = { value: resolved };
                                    staticChildNode = node;
                                    await emitStaticChildAsset();
                                }
                            }
                            break;
                        // nbind.init(...) -> require('./resolved.node')
                        case NBIND_INIT:
                            if (node.arguments.length) {
                                const arg = await computePureStaticValue(node.arguments[0], false);
                                if (arg && 'value' in arg && (typeof arg.value === 'string' || typeof arg.value === 'undefined')) {
                                    const bindingInfo = binary_locators_1.nbind(arg.value);
                                    if (bindingInfo && bindingInfo.path) {
                                        deps.add(path_1.default.relative(dir, bindingInfo.path).replace(/\\/g, '/'));
                                        return this.skip();
                                    }
                                }
                            }
                            break;
                        // Express templates:
                        // app.set("view engine", [name]) -> 'name' is a require
                        case EXPRESS_SET:
                            if (node.arguments.length === 2 &&
                                node.arguments[0].type === 'Literal' &&
                                node.arguments[0].value === 'view engine' &&
                                !definedExpressEngines) {
                                await processRequireArg(node.arguments[1]);
                                return this.skip();
                            }
                            break;
                        // app.engine('name', ...) causes opt-out of express dynamic require
                        case EXPRESS_ENGINE:
                            definedExpressEngines = true;
                            break;
                        case FS_FN:
                        case FS_DIR_FN:
                            if (node.arguments[0] && job.analysis.computeFileReferences) {
                                staticChildValue = await computePureStaticValue(node.arguments[0], true);
                                // if it computes, then we start backtracking
                                if (staticChildValue) {
                                    staticChildNode = node.arguments[0];
                                    if (calleeValue.value === FS_DIR_FN && node.arguments[0].type === 'Identifier' && node.arguments[0].name === '__dirname') {
                                        // Special case `fs.readdirSync(__dirname)` to emit right away
                                        emitAssetDirectory(dir);
                                    }
                                    else {
                                        await backtrack(parent, this);
                                    }
                                    return this.skip();
                                }
                            }
                            break;
                        // strong globalize (emits intl folder)
                        case SET_ROOT_DIR:
                            if (node.arguments[0]) {
                                const rootDir = await computePureStaticValue(node.arguments[0], false);
                                if (rootDir && 'value' in rootDir && rootDir.value)
                                    emitAssetDirectory(rootDir.value + '/intl');
                                return this.skip();
                            }
                            break;
                        // pkginfo - require('pkginfo')(module) -> loads package.json
                        case PKG_INFO:
                            let pjsonPath = path_1.default.resolve(id, '../package.json');
                            const rootPjson = path_1.default.resolve('/package.json');
                            while (pjsonPath !== rootPjson && (await job.stat(pjsonPath) === null))
                                pjsonPath = path_1.default.resolve(pjsonPath, '../../package.json');
                            if (pjsonPath !== rootPjson)
                                assets.add(pjsonPath);
                            break;
                    }
                }
            }
            else if (node.type === 'VariableDeclaration' && parent && !ast_helpers_1.isVarLoop(parent) && job.analysis.evaluatePureExpressions) {
                for (const decl of node.declarations) {
                    if (!decl.init)
                        continue;
                    const computed = await computePureStaticValue(decl.init, true);
                    if (computed) {
                        // var known = ...;
                        if (decl.id.type === 'Identifier') {
                            setKnownBinding(decl.id.name, computed);
                        }
                        // var { known } = ...;
                        else if (decl.id.type === 'ObjectPattern' && 'value' in computed) {
                            for (const prop of decl.id.properties) {
                                if (prop.type !== 'Property' ||
                                    prop.key.type !== 'Identifier' ||
                                    prop.value.type !== 'Identifier' ||
                                    typeof computed.value !== 'object' ||
                                    computed.value === null ||
                                    !(prop.key.name in computed.value))
                                    continue;
                                setKnownBinding(prop.value.name, { value: computed.value[prop.key.name] });
                            }
                        }
                        if (!('value' in computed) && isAbsolutePathOrUrl(computed.then) && isAbsolutePathOrUrl(computed.else)) {
                            staticChildValue = computed;
                            staticChildNode = decl.init;
                            await emitStaticChildAsset();
                        }
                    }
                }
            }
            else if (node.type === 'AssignmentExpression' && parent && !ast_helpers_1.isLoop(parent) && job.analysis.evaluatePureExpressions) {
                if (!hasKnownBindingValue(node.left.name)) {
                    const computed = await computePureStaticValue(node.right, false);
                    if (computed && 'value' in computed) {
                        // var known = ...
                        if (node.left.type === 'Identifier') {
                            setKnownBinding(node.left.name, computed);
                        }
                        // var { known } = ...
                        else if (node.left.type === 'ObjectPattern') {
                            for (const prop of node.left.properties) {
                                if (prop.type !== 'Property' ||
                                    prop.key.type !== 'Identifier' ||
                                    prop.value.type !== 'Identifier' ||
                                    typeof computed.value !== 'object' ||
                                    computed.value === null ||
                                    !(prop.key.name in computed.value))
                                    continue;
                                setKnownBinding(prop.value.name, { value: computed.value[prop.key.name] });
                            }
                        }
                        if (isAbsolutePathOrUrl(computed.value)) {
                            staticChildValue = computed;
                            staticChildNode = node.right;
                            await emitStaticChildAsset();
                        }
                    }
                }
            }
            // Support require wrappers like function p (x) { ...; var y = require(x); ...; return y;  }
            else if ((!isESM || job.mixedModules) &&
                (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') &&
                (node.arguments || node.params)[0] && (node.arguments || node.params)[0].type === 'Identifier') {
                let fnName;
                let args;
                if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
                    parent &&
                    parent.type === 'VariableDeclarator' &&
                    parent.id.type === 'Identifier') {
                    fnName = parent.id;
                    args = node.arguments || node.params;
                }
                else if (node.id) {
                    fnName = node.id;
                    args = node.arguments || node.params;
                }
                if (fnName && node.body.body) {
                    let requireDecl, returned = false;
                    for (let i = 0; i < node.body.body.length; i++) {
                        if (node.body.body[i].type === 'VariableDeclaration' && !requireDecl) {
                            requireDecl = node.body.body[i].declarations.find((decl) => decl &&
                                decl.id &&
                                decl.id.type === 'Identifier' &&
                                decl.init &&
                                decl.init.type === 'CallExpression' &&
                                decl.init.callee.type === 'Identifier' &&
                                decl.init.callee.name === 'require' &&
                                knownBindings.require.shadowDepth === 0 &&
                                decl.init.arguments[0] &&
                                decl.init.arguments[0].type === 'Identifier' &&
                                decl.init.arguments[0].name === args[0].name);
                        }
                        if (requireDecl &&
                            node.body.body[i].type === 'ReturnStatement' &&
                            node.body.body[i].argument &&
                            node.body.body[i].argument.type === 'Identifier' &&
                            node.body.body[i].argument.name === requireDecl.id.name) {
                            returned = true;
                            break;
                        }
                    }
                    if (returned)
                        setKnownBinding(fnName.name, { value: BOUND_REQUIRE });
                }
            }
        },
        async leave(_node, _parent) {
            const node = _node;
            const parent = _parent;
            if (node.scope) {
                if (scope.parent) {
                    scope = scope.parent;
                }
                for (const id in node.scope.declarations) {
                    if (id in knownBindings) {
                        if (knownBindings[id].shadowDepth > 0)
                            knownBindings[id].shadowDepth--;
                        else
                            delete knownBindings[id];
                    }
                }
            }
            if (staticChildNode && parent)
                await backtrack(parent, this);
        }
    });
    await assetEmissionPromises;
    return { assets, deps, imports, isESM };
    async function emitAssetPath(assetPath) {
        // verify the asset file / directory exists
        const wildcardIndex = assetPath.indexOf(static_eval_1.WILDCARD);
        const dirIndex = wildcardIndex === -1 ? assetPath.length : assetPath.lastIndexOf(path_1.default.sep, wildcardIndex);
        const basePath = assetPath.substring(0, dirIndex);
        try {
            var stats = await job.stat(basePath);
            if (stats === null) {
                throw new Error('file not found');
            }
        }
        catch (e) {
            return;
        }
        if (wildcardIndex !== -1 && stats.isFile())
            return;
        if (stats.isFile()) {
            assets.add(assetPath);
        }
        else if (stats.isDirectory()) {
            if (validWildcard(assetPath))
                emitAssetDirectory(assetPath);
        }
    }
    function validWildcard(assetPath) {
        let wildcardSuffix = '';
        if (assetPath.endsWith(path_1.default.sep))
            wildcardSuffix = path_1.default.sep;
        else if (assetPath.endsWith(path_1.default.sep + static_eval_1.WILDCARD))
            wildcardSuffix = path_1.default.sep + static_eval_1.WILDCARD;
        else if (assetPath.endsWith(static_eval_1.WILDCARD))
            wildcardSuffix = static_eval_1.WILDCARD;
        // do not emit __dirname
        if (assetPath === dir + wildcardSuffix)
            return false;
        // do not emit cwd
        if (assetPath === cwd + wildcardSuffix)
            return false;
        // do not emit node_modules
        if (assetPath.endsWith(path_1.default.sep + 'node_modules' + wildcardSuffix))
            return false;
        // do not emit directories above __dirname
        if (dir.startsWith(assetPath.slice(0, assetPath.length - wildcardSuffix.length) + path_1.default.sep))
            return false;
        // do not emit asset directories higher than the node_modules base if a package
        if (pkgBase) {
            const nodeModulesBase = id.substring(0, id.indexOf(path_1.default.sep + 'node_modules')) + path_1.default.sep + 'node_modules' + path_1.default.sep;
            if (!assetPath.startsWith(nodeModulesBase)) {
                if (job.log)
                    console.log('Skipping asset emission of ' + assetPath.replace(static_eval_1.wildcardRegEx, '*') + ' for ' + id + ' as it is outside the package base ' + pkgBase);
                return false;
            }
        }
        return true;
    }
    function resolveAbsolutePathOrUrl(value) {
        return value instanceof url_1.URL ? url_1.fileURLToPath(value) : value.startsWith('file:') ? url_1.fileURLToPath(new url_1.URL(value)) : path_1.default.resolve(value);
    }
    async function emitStaticChildAsset() {
        if (!staticChildValue) {
            return;
        }
        if ('value' in staticChildValue && isAbsolutePathOrUrl(staticChildValue.value)) {
            try {
                const resolved = resolveAbsolutePathOrUrl(staticChildValue.value);
                await emitAssetPath(resolved);
            }
            catch (e) { }
        }
        else if ('then' in staticChildValue && 'else' in staticChildValue && isAbsolutePathOrUrl(staticChildValue.then) && isAbsolutePathOrUrl(staticChildValue.else)) {
            let resolvedThen;
            try {
                resolvedThen = resolveAbsolutePathOrUrl(staticChildValue.then);
            }
            catch (e) { }
            let resolvedElse;
            try {
                resolvedElse = resolveAbsolutePathOrUrl(staticChildValue.else);
            }
            catch (e) { }
            if (resolvedThen)
                await emitAssetPath(resolvedThen);
            if (resolvedElse)
                await emitAssetPath(resolvedElse);
        }
        else if (staticChildNode && staticChildNode.type === 'ArrayExpression' && 'value' in staticChildValue && staticChildValue.value instanceof Array) {
            for (const value of staticChildValue.value) {
                try {
                    const resolved = resolveAbsolutePathOrUrl(value);
                    await emitAssetPath(resolved);
                }
                catch (e) { }
            }
        }
        staticChildNode = staticChildValue = undefined;
    }
}
exports.default = analyze;
;
function isAst(ast) {
    return 'body' in ast;
}

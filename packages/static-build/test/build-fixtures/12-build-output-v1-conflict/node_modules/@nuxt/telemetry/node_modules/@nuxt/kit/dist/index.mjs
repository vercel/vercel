import { parse, basename, resolve, normalize, join, relative, isAbsolute, dirname, extname } from 'pathe';
import consola from 'consola';
import { existsSync, readFileSync, promises } from 'node:fs';
import hash from 'hash-sum';
import { getContext } from 'unctx';
import satisfies from 'semver/functions/satisfies.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { interopDefault } from 'mlly';
import jiti from 'jiti';
import { globby } from 'globby';
import ignore from 'ignore';
import defu from 'defu';
import { applyDefaults } from 'untyped';
import lodashTemplate from 'lodash.template';
import { camelCase, kebabCase, pascalCase } from 'scule';
import { genDynamicImport, genImport } from 'knitwork';
import { loadConfig } from 'c12';
import { NuxtConfigSchema } from '@nuxt/schema';
import { resolvePackageJSON, readPackageJSON } from 'pkg-types';

const logger = consola;
function useLogger(scope) {
  return scope ? logger.withScope(scope) : logger;
}

function chainFn(base, fn) {
  if (typeof fn !== "function") {
    return base;
  }
  return function(...args) {
    if (typeof base !== "function") {
      return fn.apply(this, args);
    }
    let baseResult = base.apply(this, args);
    if (baseResult === void 0) {
      [baseResult] = args;
    }
    const fnResult = fn.call(this, baseResult, ...Array.prototype.slice.call(args, 1));
    if (fnResult === void 0) {
      return baseResult;
    }
    return fnResult;
  };
}

const nuxtCtx = getContext("nuxt");
function useNuxt() {
  const instance = nuxtCtx.use();
  if (!instance) {
    throw new Error("Nuxt instance is unavailable!");
  }
  return instance;
}
function tryUseNuxt() {
  return nuxtCtx.use();
}

function addTemplate(_template) {
  const nuxt = useNuxt();
  const template = normalizeTemplate(_template);
  nuxt.options.build.templates = nuxt.options.build.templates.filter((p) => normalizeTemplate(p).filename !== template.filename);
  nuxt.options.build.templates.push(template);
  return template;
}
function normalizeTemplate(template) {
  if (!template) {
    throw new Error("Invalid template: " + JSON.stringify(template));
  }
  if (typeof template === "string") {
    template = { src: template };
  } else {
    template = { ...template };
  }
  if (template.src) {
    if (!existsSync(template.src)) {
      throw new Error("Template not found: " + template.src);
    }
    if (!template.filename) {
      const srcPath = parse(template.src);
      template.filename = template.fileName || `${basename(srcPath.dir)}.${srcPath.name}.${hash(template.src)}${srcPath.ext}`;
    }
  }
  if (!template.src && !template.getContents) {
    throw new Error("Invalid template. Either getContents or src options should be provided: " + JSON.stringify(template));
  }
  if (!template.filename) {
    throw new Error("Invalid template. Either filename should be provided: " + JSON.stringify(template));
  }
  if (template.filename.endsWith(".d.ts")) {
    template.write = true;
  }
  if (!template.dst) {
    const nuxt = useNuxt();
    template.dst = resolve(nuxt.options.buildDir, template.filename);
  }
  return template;
}

function addServerMiddleware(middleware) {
  useNuxt().options.serverMiddleware.push(middleware);
}

async function checkNuxtCompatibility(constraints, nuxt = useNuxt()) {
  const issues = [];
  if (constraints.nuxt) {
    const nuxtVersion = getNuxtVersion(nuxt);
    const nuxtSemanticVersion = nuxtVersion.split("-").shift();
    if (!satisfies(nuxtSemanticVersion, constraints.nuxt)) {
      issues.push({
        name: "nuxt",
        message: `Nuxt version \`${constraints.nuxt}\` is required but currently using \`${nuxtVersion}\``
      });
    }
  }
  if (isNuxt2(nuxt)) {
    const bridgeRequirement = constraints?.bridge;
    const hasBridge = !!nuxt.options.bridge;
    if (bridgeRequirement === true && !hasBridge) {
      issues.push({
        name: "bridge",
        message: "Nuxt bridge is required"
      });
    } else if (bridgeRequirement === false && hasBridge) {
      issues.push({
        name: "bridge",
        message: "Nuxt bridge is not supported"
      });
    }
  }
  await nuxt.callHook("kit:compatibility", constraints, issues);
  issues.toString = () => issues.map((issue) => ` - [${issue.name}] ${issue.message}`).join("\n");
  return issues;
}
async function assertNuxtCompatibility(constraints, nuxt = useNuxt()) {
  const issues = await checkNuxtCompatibility(constraints, nuxt);
  if (issues.length) {
    throw new Error("Nuxt compatibility issues found:\n" + issues.toString());
  }
  return true;
}
async function hasNuxtCompatibility(constraints, nuxt = useNuxt()) {
  const issues = await checkNuxtCompatibility(constraints, nuxt);
  return !issues.length;
}
function isNuxt2(nuxt = useNuxt()) {
  return getNuxtVersion(nuxt).startsWith("2.");
}
function isNuxt3(nuxt = useNuxt()) {
  return getNuxtVersion(nuxt).startsWith("3.");
}
function getNuxtVersion(nuxt = useNuxt()) {
  const version = (nuxt?._version || nuxt?.version || nuxt?.constructor?.version || "").replace(/^v/g, "");
  if (!version) {
    throw new Error("Cannot determine nuxt version! Is currect instance passed?");
  }
  return version;
}

function normalizePlugin(plugin) {
  if (typeof plugin === "string") {
    plugin = { src: plugin };
  } else {
    plugin = { ...plugin };
  }
  if (!plugin.src) {
    throw new Error("Invalid plugin. src option is required: " + JSON.stringify(plugin));
  }
  plugin.src = normalize(plugin.src);
  if (plugin.ssr) {
    plugin.mode = "server";
  }
  if (!plugin.mode) {
    const [, mode = "all"] = plugin.src.match(/\.(server|client)(\.\w+)*$/) || [];
    plugin.mode = mode;
  }
  return plugin;
}
function addPlugin(_plugin, opts = {}) {
  const nuxt = useNuxt();
  const plugin = normalizePlugin(_plugin);
  nuxt.options.plugins = nuxt.options.plugins.filter((p) => normalizePlugin(p).src !== plugin.src);
  nuxt.options.plugins[opts.append ? "push" : "unshift"](plugin);
  return plugin;
}
function addPluginTemplate(plugin, opts = {}) {
  const normalizedPlugin = typeof plugin === "string" ? { src: plugin } : { ...plugin, src: addTemplate(plugin).dst };
  return addPlugin(normalizedPlugin, opts);
}

const _require = jiti(process.cwd(), { interopDefault: true });
function isNodeModules(id) {
  return /[/\\]node_modules[/\\]/.test(id);
}
function clearRequireCache(id) {
  if (isNodeModules(id)) {
    return;
  }
  const entry = getRequireCacheItem(id);
  if (!entry) {
    delete _require.cache[id];
    return;
  }
  if (entry.parent) {
    entry.parent.children = entry.parent.children.filter((e) => e.id !== id);
  }
  for (const child of entry.children) {
    clearRequireCache(child.id);
  }
  delete _require.cache[id];
}
function scanRequireTree(id, files = /* @__PURE__ */ new Set()) {
  if (isNodeModules(id) || files.has(id)) {
    return files;
  }
  const entry = getRequireCacheItem(id);
  if (!entry) {
    files.add(id);
    return files;
  }
  files.add(entry.id);
  for (const child of entry.children) {
    scanRequireTree(child.id, files);
  }
  return files;
}
function getRequireCacheItem(id) {
  try {
    return _require.cache[id];
  } catch (e) {
  }
}
function requireModulePkg(id, opts = {}) {
  return requireModule(join(id, "package.json"), opts);
}
function resolveModule(id, opts = {}) {
  return normalize(_require.resolve(id, {
    paths: [].concat(global.__NUXT_PREPATHS__, opts.paths, process.cwd(), global.__NUXT_PATHS__).filter(Boolean)
  }));
}
function tryResolveModule(path, opts = {}) {
  try {
    return resolveModule(path, opts);
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
  }
  return null;
}
function requireModule(id, opts = {}) {
  const resolvedPath = resolveModule(id, opts);
  if (opts.clearCache && !isNodeModules(id)) {
    clearRequireCache(resolvedPath);
  }
  const requiredModule = _require(resolvedPath);
  return requiredModule;
}
function importModule(id, opts = {}) {
  const resolvedPath = resolveModule(id, opts);
  if (opts.interopDefault !== false) {
    return import(pathToFileURL(resolvedPath).href).then(interopDefault);
  }
  return import(pathToFileURL(resolvedPath).href);
}
function tryImportModule(id, opts = {}) {
  try {
    return importModule(id, opts).catch(() => void 0);
  } catch {
  }
}
function tryRequireModule(id, opts = {}) {
  try {
    return requireModule(id, opts);
  } catch (e) {
  }
}

function isIgnored(pathname) {
  const nuxt = tryUseNuxt();
  if (!nuxt) {
    return null;
  }
  if (!nuxt._ignore) {
    nuxt._ignore = ignore(nuxt.options.ignoreOptions);
    nuxt._ignore.add(nuxt.options.ignore);
    const nuxtignoreFile = join(nuxt.options.rootDir, ".nuxtignore");
    if (existsSync(nuxtignoreFile)) {
      nuxt._ignore.add(readFileSync(nuxtignoreFile, "utf-8"));
    }
  }
  const relativePath = relative(nuxt.options.rootDir, pathname);
  if (relativePath.startsWith("..")) {
    return false;
  }
  return relativePath && nuxt._ignore.ignores(relativePath);
}

async function resolvePath(path, opts = {}) {
  const _path = path;
  path = normalize(path);
  if (isAbsolute(path) && existsSync(path)) {
    return path;
  }
  const nuxt = useNuxt();
  const cwd = opts.cwd || (nuxt ? nuxt.options.rootDir : process.cwd());
  const extensions = opts.extensions || (nuxt ? nuxt.options.extensions : [".ts", ".mjs", ".cjs", ".json"]);
  const modulesDir = nuxt ? nuxt.options.modulesDir : [];
  path = resolveAlias(path);
  if (!isAbsolute(path)) {
    path = resolve(cwd, path);
  }
  let isDirectory = false;
  if (existsSync(path)) {
    isDirectory = (await promises.lstat(path)).isDirectory();
    if (!isDirectory) {
      return path;
    }
  }
  for (const ext of extensions) {
    const pathWithExt = path + ext;
    if (existsSync(pathWithExt)) {
      return pathWithExt;
    }
    const pathWithIndex = join(path, "index" + ext);
    if (isDirectory && existsSync(pathWithIndex)) {
      return pathWithIndex;
    }
  }
  const resolveModulePath = tryResolveModule(_path, { paths: [cwd, ...modulesDir] });
  if (resolveModulePath) {
    return resolveModulePath;
  }
  return path;
}
async function findPath(paths, opts, pathType = "file") {
  if (!Array.isArray(paths)) {
    paths = [paths];
  }
  for (const path of paths) {
    const rPath = await resolvePath(path, opts);
    if (await existsSensitive(rPath)) {
      const isDirectory = (await promises.lstat(rPath)).isDirectory();
      if (!pathType || pathType === "file" && !isDirectory || pathType === "dir" && isDirectory) {
        return rPath;
      }
    }
  }
  return null;
}
function resolveAlias(path, alias) {
  if (!alias) {
    alias = tryUseNuxt()?.options.alias || {};
  }
  for (const key in alias) {
    if (key === "@" && !path.startsWith("@/")) {
      continue;
    }
    if (path.startsWith(key)) {
      path = alias[key] + path.slice(key.length);
    }
  }
  return path;
}
function createResolver(base) {
  if (!base) {
    throw new Error("`base` argument is missing for createResolver(base)!");
  }
  base = base.toString();
  if (base.startsWith("file://")) {
    base = dirname(fileURLToPath(base));
  }
  return {
    resolve: (...path) => resolve(base, ...path),
    resolvePath: (path, opts) => resolvePath(path, { cwd: base, ...opts })
  };
}
async function existsSensitive(path) {
  if (!existsSync(path)) {
    return false;
  }
  const dirFiles = await promises.readdir(dirname(path));
  return dirFiles.includes(basename(path));
}
async function resolveFiles(path, pattern) {
  const files = await globby(pattern, { cwd: path, followSymbolicLinks: true });
  return files.filter((p) => !isIgnored(p)).map((p) => resolve(path, p));
}

async function installModule(moduleToInstall, _inlineOptions, _nuxt) {
  const nuxt = useNuxt();
  const { nuxtModule, inlineOptions } = await normalizeModule(moduleToInstall, _inlineOptions);
  await nuxtModule.call(useModuleContainer(), inlineOptions, nuxt);
  nuxt.options._installedModules = nuxt.options._installedModules || [];
  nuxt.options._installedModules.push({
    meta: await nuxtModule.getMeta?.(),
    entryPath: typeof moduleToInstall === "string" ? resolveAlias(moduleToInstall) : void 0
  });
}
async function normalizeModule(nuxtModule, inlineOptions) {
  const nuxt = useNuxt();
  if (nuxtModule?._version || nuxtModule?.version || nuxtModule?.constructor?.version || "") {
    [nuxtModule, inlineOptions] = [inlineOptions, {}];
    console.warn(new Error("`installModule` is being called with old signature!"));
  }
  if (typeof nuxtModule === "string") {
    const _src = resolveModule(resolveAlias(nuxtModule), { paths: nuxt.options.modulesDir });
    const isESM = _src.endsWith(".mjs");
    nuxtModule = isESM ? await importModule(_src) : requireModule(_src);
  }
  if (typeof nuxtModule !== "function") {
    throw new TypeError("Nuxt module should be a function: " + nuxtModule);
  }
  return { nuxtModule, inlineOptions };
}

const MODULE_CONTAINER_KEY = "__module_container__";
function useModuleContainer(nuxt = useNuxt()) {
  if (nuxt[MODULE_CONTAINER_KEY]) {
    return nuxt[MODULE_CONTAINER_KEY];
  }
  async function requireModule(moduleOpts) {
    let src, inlineOptions;
    if (typeof moduleOpts === "string") {
      src = moduleOpts;
    } else if (Array.isArray(moduleOpts)) {
      [src, inlineOptions] = moduleOpts;
    } else if (typeof moduleOpts === "object") {
      if (moduleOpts.src || moduleOpts.handler) {
        src = moduleOpts.src || moduleOpts.handler;
        inlineOptions = moduleOpts.options;
      } else {
        src = moduleOpts;
      }
    } else {
      src = moduleOpts;
    }
    await installModule(src, inlineOptions);
  }
  nuxt[MODULE_CONTAINER_KEY] = {
    nuxt,
    options: nuxt.options,
    ready() {
      return Promise.resolve();
    },
    addVendor() {
    },
    requireModule,
    addModule: requireModule,
    addServerMiddleware,
    addTemplate(template) {
      if (typeof template === "string") {
        template = { src: template };
      }
      if (template.write === void 0) {
        template.write = true;
      }
      return addTemplate(template);
    },
    addPlugin(pluginTemplate) {
      return addPluginTemplate(pluginTemplate);
    },
    addLayout(tmpl, name) {
      const { filename, src } = addTemplate(tmpl);
      const layoutName = name || parse(src).name;
      const layout = nuxt.options.layouts[layoutName];
      if (layout) {
        logger.warn(`Duplicate layout registration, "${layoutName}" has been registered as "${layout}"`);
      }
      nuxt.options.layouts[layoutName] = `./${filename}`;
      if (name === "error") {
        this.addErrorLayout(filename);
      }
    },
    addErrorLayout(dst) {
      const relativeBuildDir = relative(nuxt.options.rootDir, nuxt.options.buildDir);
      nuxt.options.ErrorPage = `~/${relativeBuildDir}/${dst}`;
    },
    extendBuild(fn) {
      nuxt.options.build.extend = chainFn(nuxt.options.build.extend, fn);
      if (!isNuxt2(nuxt)) {
        console.warn("[kit] [compat] Using `extendBuild` in Nuxt 3 has no effect. Instead call extendWebpackConfig and extendViteConfig.");
      }
    },
    extendRoutes(fn) {
      if (isNuxt2(nuxt)) {
        nuxt.options.router.extendRoutes = chainFn(nuxt.options.router.extendRoutes, fn);
      } else {
        nuxt.hook("pages:extend", async (pages, ...args) => {
          const maybeRoutes = await fn(pages, ...args);
          if (maybeRoutes) {
            console.warn("[kit] [compat] Using `extendRoutes` in Nuxt 3 needs to directly modify first argument instead of returning updated routes. Skipping extended routes.");
          }
        });
      }
    }
  };
  return nuxt[MODULE_CONTAINER_KEY];
}

async function compileTemplate(template, ctx) {
  const data = { ...ctx, options: template.options };
  if (template.src) {
    try {
      const srcContents = await promises.readFile(template.src, "utf-8");
      return lodashTemplate(srcContents, {})(data);
    } catch (err) {
      console.error("Error compiling template: ", template);
      throw err;
    }
  }
  if (template.getContents) {
    return template.getContents(data);
  }
  throw new Error("Invalid template: " + JSON.stringify(template));
}
const serialize = (data) => JSON.stringify(data, null, 2).replace(/"{(.+)}"(?=,?$)/gm, (r) => JSON.parse(r).replace(/^{(.*)}$/, "$1"));
const importName = (src) => `${camelCase(basename(src, extname(src))).replace(/[^a-zA-Z?\d\s:]/g, "")}_${hash(src)}`;
const importSources = (sources, { lazy = false } = {}) => {
  if (!Array.isArray(sources)) {
    sources = [sources];
  }
  return sources.map((src) => {
    if (lazy) {
      return `const ${importName(src)} = ${genDynamicImport(src, { comment: `webpackChunkName: ${JSON.stringify(src)}` })}`;
    }
    return genImport(src, importName(src));
  }).join("\n");
};
const templateUtils = { serialize, importName, importSources };

function defineNuxtModule(definition) {
  if (typeof definition === "function") {
    definition = definition(useNuxt());
    logger.warn("Module definition as function is deprecated and will be removed in the future versions", definition);
  }
  if (!definition.meta) {
    definition.meta = {};
  }
  if (!definition.meta.configKey) {
    definition.meta.name = definition.meta.name || definition.name;
    definition.meta.configKey = definition.meta.configKey || definition.configKey || definition.meta.name;
  }
  function getOptions(inlineOptions, nuxt = useNuxt()) {
    const configKey = definition.meta.configKey || definition.meta.name;
    const _defaults = definition.defaults instanceof Function ? definition.defaults(nuxt) : definition.defaults;
    let _options = defu(inlineOptions, nuxt.options[configKey], _defaults);
    if (definition.schema) {
      _options = applyDefaults(definition.schema, _options);
    }
    return Promise.resolve(_options);
  }
  async function normalizedModule(inlineOptions, nuxt) {
    if (!nuxt) {
      nuxt = tryUseNuxt() || this.nuxt;
    }
    const uniqueKey = definition.meta.name || definition.meta.configKey;
    if (uniqueKey) {
      nuxt.options._requiredModules = nuxt.options._requiredModules || {};
      if (nuxt.options._requiredModules[uniqueKey]) {
        return;
      }
      nuxt.options._requiredModules[uniqueKey] = true;
    }
    if (definition.meta.compatibility) {
      const issues = await checkNuxtCompatibility(definition.meta.compatibility, nuxt);
      if (issues.length) {
        logger.warn(`Module \`${definition.meta.name}\` is disabled due to incompatibility issues:
${issues.toString()}`);
        return;
      }
    }
    nuxt2Shims(nuxt);
    const _options = await getOptions(inlineOptions, nuxt);
    if (definition.hooks) {
      nuxt.hooks.addHooks(definition.hooks);
    }
    await definition.setup?.call(null, _options, nuxt);
  }
  normalizedModule.getMeta = () => Promise.resolve(definition.meta);
  normalizedModule.getOptions = getOptions;
  return normalizedModule;
}
const NUXT2_SHIMS_KEY = "__nuxt2_shims_key__";
function nuxt2Shims(nuxt) {
  if (!isNuxt2(nuxt) || nuxt[NUXT2_SHIMS_KEY]) {
    return;
  }
  nuxt[NUXT2_SHIMS_KEY] = true;
  nuxt.hooks = nuxt;
  if (!nuxtCtx.use()) {
    nuxtCtx.set(nuxt);
    nuxt.hook("close", () => nuxtCtx.unset());
  }
  let virtualTemplates;
  nuxt.hook("builder:prepared", (_builder, buildOptions) => {
    virtualTemplates = buildOptions.templates.filter((t) => t.getContents);
    for (const template of virtualTemplates) {
      buildOptions.templates.splice(buildOptions.templates.indexOf(template), 1);
    }
  });
  nuxt.hook("build:templates", async (templates) => {
    const context = {
      nuxt,
      utils: templateUtils,
      app: {
        dir: nuxt.options.srcDir,
        extensions: nuxt.options.extensions,
        plugins: nuxt.options.plugins,
        templates: [
          ...templates.templatesFiles,
          ...virtualTemplates
        ],
        templateVars: templates.templateVars
      }
    };
    for await (const template of virtualTemplates) {
      const contents = await compileTemplate({ ...template, src: "" }, context);
      await promises.mkdir(dirname(template.dst), { recursive: true });
      await promises.writeFile(template.dst, contents);
    }
  });
}

async function loadNuxtConfig(opts) {
  const { config: nuxtConfig, configFile, layers, cwd } = await loadConfig({
    name: "nuxt",
    configFile: "nuxt.config",
    rcFile: ".nuxtrc",
    dotenv: true,
    globalRc: true,
    ...opts
  });
  nuxtConfig.rootDir = nuxtConfig.rootDir || cwd;
  nuxtConfig._nuxtConfigFile = configFile;
  nuxtConfig._nuxtConfigFiles = [configFile];
  for (const layer of layers) {
    layer.config.rootDir = layer.config.rootDir ?? layer.cwd;
    layer.config.srcDir = resolve(layer.config.rootDir, layer.config.srcDir);
  }
  nuxtConfig._layers = layers.filter((layer) => layer.configFile && !layer.configFile.endsWith(".nuxtrc"));
  return applyDefaults(NuxtConfigSchema, nuxtConfig);
}

async function loadNuxt(opts) {
  opts.cwd = opts.cwd || opts.rootDir;
  opts.overrides = opts.overrides || opts.config || {};
  const resolveOpts = { paths: opts.cwd };
  opts.overrides.dev = !!opts.dev;
  const nearestNuxtPkg = await Promise.all(["nuxt3", "nuxt", "nuxt-edge"].map((pkg2) => resolvePackageJSON(pkg2, { url: opts.cwd }).catch(() => null))).then((r) => r.filter(Boolean).sort((a, b) => b.length - a.length)[0]);
  if (!nearestNuxtPkg) {
    throw new Error(`Cannot find any nuxt version from ${opts.cwd}`);
  }
  const pkg = await readPackageJSON(nearestNuxtPkg);
  const majorVersion = parseInt((pkg.version || "").split(".")[0]);
  if (majorVersion === 3) {
    const { loadNuxt: loadNuxt3 } = await importModule(pkg._name || pkg.name, resolveOpts);
    const nuxt2 = await loadNuxt3(opts);
    return nuxt2;
  }
  const { loadNuxt: loadNuxt2 } = await tryImportModule("nuxt-edge", resolveOpts) || await importModule("nuxt", resolveOpts);
  const nuxt = await loadNuxt2({
    rootDir: opts.cwd,
    for: opts.dev ? "dev" : "build",
    configOverrides: opts.overrides,
    ready: opts.ready,
    envConfig: opts.dotenv
  });
  return nuxt;
}
async function buildNuxt(nuxt) {
  const resolveOpts = { paths: nuxt.options.rootDir };
  if (nuxt.options._majorVersion === 3) {
    const { build: build2 } = await tryImportModule("nuxt3", resolveOpts) || await importModule("nuxt", resolveOpts);
    return build2(nuxt);
  }
  const { build } = await tryImportModule("nuxt-edge", resolveOpts) || await importModule("nuxt", resolveOpts);
  return build(nuxt);
}

function addAutoImport(imports) {
  assertNuxtCompatibility({ bridge: true });
  useNuxt().hook("autoImports:extend", (autoImports) => {
    autoImports.push(...Array.isArray(imports) ? imports : [imports]);
  });
}
function addAutoImportDir(_autoImportDirs) {
  assertNuxtCompatibility({ bridge: true });
  useNuxt().hook("autoImports:dirs", (autoImportDirs) => {
    for (const dir of Array.isArray(_autoImportDirs) ? _autoImportDirs : [_autoImportDirs]) {
      autoImportDirs.push(dir);
    }
  });
}

function extendWebpackConfig(fn, options = {}) {
  const nuxt = useNuxt();
  if (options.dev === false && nuxt.options.dev) {
    return;
  }
  if (options.build === false && nuxt.options.build) {
    return;
  }
  nuxt.hook("webpack:config", (configs) => {
    if (options.server !== false) {
      const config = configs.find((i) => i.name === "server");
      if (config) {
        fn(config);
      }
    }
    if (options.client !== false) {
      const config = configs.find((i) => i.name === "client");
      if (config) {
        fn(config);
      }
    }
    if (options.modern !== false) {
      const config = configs.find((i) => i.name === "modern");
      if (config) {
        fn(config);
      }
    }
  });
}
function extendViteConfig(fn, options = {}) {
  const nuxt = useNuxt();
  if (options.dev === false && nuxt.options.dev) {
    return;
  }
  if (options.build === false && nuxt.options.build) {
    return;
  }
  nuxt.hook("vite:extend", ({ config }) => fn(config));
}
function addWebpackPlugin(plugin, options) {
  extendWebpackConfig((config) => {
    config.plugins = config.plugins || [];
    config.plugins.push(plugin);
  }, options);
}
function addVitePlugin(plugin, options) {
  extendViteConfig((config) => {
    config.plugins = config.plugins || [];
    config.plugins.push(plugin);
  }, options);
}

async function addComponentsDir(dir) {
  const nuxt = useNuxt();
  await assertNuxtCompatibility({ nuxt: ">=2.13" }, nuxt);
  nuxt.options.components = nuxt.options.components || [];
  nuxt.hook("components:dirs", (dirs) => {
    dirs.push(dir);
  });
}
async function addComponent(opts) {
  const nuxt = useNuxt();
  await assertNuxtCompatibility({ nuxt: ">=2.13" }, nuxt);
  nuxt.options.components = nuxt.options.components || [];
  const component = {
    export: opts.export || "default",
    chunkName: "components/" + kebabCase(opts.name),
    global: opts.global ?? false,
    kebabName: kebabCase(opts.name || ""),
    pascalName: pascalCase(opts.name || ""),
    prefetch: false,
    preload: false,
    mode: "all",
    shortPath: opts.filePath,
    async: false,
    level: 0,
    asyncImport: `${genDynamicImport(opts.filePath)}.then(r => r['${opts.export || "default"}'])`,
    import: `require(${JSON.stringify(opts.filePath)})['${opts.export || "default"}']`,
    ...opts
  };
  nuxt.hook("components:extend", (components) => {
    const existingComponent = components.find((c) => c.pascalName === component.pascalName || c.kebabName === component.kebabName);
    if (existingComponent) {
      const name = existingComponent.pascalName || existingComponent.kebabName;
      console.warn(`Overriding ${name} component.`);
      Object.assign(existingComponent, component);
    } else {
      components.push(component);
    }
  });
}

function extendPages(cb) {
  const nuxt = useNuxt();
  if (isNuxt2(nuxt)) {
    nuxt.hook("build:extendRoutes", cb);
  } else {
    nuxt.hook("pages:extend", cb);
  }
}

export { addAutoImport, addAutoImportDir, addComponent, addComponentsDir, addPlugin, addPluginTemplate, addServerMiddleware, addTemplate, addVitePlugin, addWebpackPlugin, assertNuxtCompatibility, buildNuxt, checkNuxtCompatibility, clearRequireCache, compileTemplate, createResolver, defineNuxtModule, extendPages, extendViteConfig, extendWebpackConfig, findPath, getNuxtVersion, getRequireCacheItem, hasNuxtCompatibility, importModule, installModule, isIgnored, isNodeModules, isNuxt2, isNuxt3, loadNuxt, loadNuxtConfig, logger, normalizePlugin, normalizeTemplate, nuxtCtx, requireModule, requireModulePkg, resolveAlias, resolveFiles, resolveModule, resolvePath, scanRequireTree, templateUtils, tryImportModule, tryRequireModule, tryResolveModule, tryUseNuxt, useLogger, useModuleContainer, useNuxt };

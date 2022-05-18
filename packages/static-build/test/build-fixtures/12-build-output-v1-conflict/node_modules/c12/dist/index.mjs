import { existsSync, promises } from 'fs';
import { resolve, extname, dirname } from 'pathe';
import * as dotenv from 'dotenv';
import os from 'os';
import createJiti from 'jiti';
import * as rc9 from 'rc9';
import defu from 'defu';

async function setupDotenv(options) {
  const targetEnv = options.env ?? process.env;
  const env = await loadDotenv({
    cwd: options.cwd,
    fileName: options.fileName ?? ".env",
    env: targetEnv,
    interpolate: options.interpolate ?? true
  });
  for (const key in env) {
    if (!key.startsWith("_") && targetEnv[key] === void 0) {
      targetEnv[key] = env[key];
    }
  }
  return env;
}
async function loadDotenv(opts) {
  const env = /* @__PURE__ */ Object.create(null);
  const dotenvFile = resolve(opts.cwd, opts.fileName);
  if (existsSync(dotenvFile)) {
    const parsed = dotenv.parse(await promises.readFile(dotenvFile, "utf-8"));
    Object.assign(env, parsed);
  }
  if (!opts.env._applied) {
    Object.assign(env, opts.env);
    env._applied = true;
  }
  if (opts.interpolate) {
    interpolate(env);
  }
  return env;
}
function interpolate(target, source = {}, parse = (v) => v) {
  function getValue(key) {
    return source[key] !== void 0 ? source[key] : target[key];
  }
  function interpolate2(value, parents = []) {
    if (typeof value !== "string") {
      return value;
    }
    const matches = value.match(/(.?\${?(?:[a-zA-Z0-9_:]+)?}?)/g) || [];
    return parse(matches.reduce((newValue, match) => {
      const parts = /(.?)\${?([a-zA-Z0-9_:]+)?}?/g.exec(match);
      const prefix = parts[1];
      let value2, replacePart;
      if (prefix === "\\") {
        replacePart = parts[0];
        value2 = replacePart.replace("\\$", "$");
      } else {
        const key = parts[2];
        replacePart = parts[0].substring(prefix.length);
        if (parents.includes(key)) {
          console.warn(`Please avoid recursive environment variables ( loop: ${parents.join(" > ")} > ${key} )`);
          return "";
        }
        value2 = getValue(key);
        value2 = interpolate2(value2, [...parents, key]);
      }
      return value2 !== void 0 ? newValue.replace(replacePart, value2) : newValue;
    }, value));
  }
  for (const key in target) {
    target[key] = interpolate2(getValue(key));
  }
}

async function loadConfig(opts) {
  opts.cwd = resolve(process.cwd(), opts.cwd || ".");
  opts.name = opts.name || "config";
  opts.configFile = opts.configFile ?? (opts.name !== "config" ? `${opts.name}.config` : "config");
  opts.rcFile = opts.rcFile ?? `.${opts.name}rc`;
  if (opts.extend !== false) {
    opts.extend = {
      extendKey: "extends",
      ...opts.extend
    };
  }
  const r = {
    config: {},
    cwd: opts.cwd,
    configFile: resolve(opts.cwd, opts.configFile),
    layers: []
  };
  if (opts.dotenv) {
    await setupDotenv({
      cwd: opts.cwd,
      ...opts.dotenv === true ? {} : opts.dotenv
    });
  }
  const { config, configFile } = await resolveConfig(".", opts);
  if (configFile) {
    r.configFile = configFile;
  }
  const configRC = {};
  if (opts.rcFile) {
    if (opts.globalRc) {
      Object.assign(configRC, rc9.readUser({ name: opts.rcFile, dir: opts.cwd }));
    }
    Object.assign(configRC, rc9.read({ name: opts.rcFile, dir: opts.cwd }));
  }
  r.config = defu(opts.overrides, config, configRC);
  if (opts.extend) {
    await extendConfig(r.config, opts);
    r.layers = r.config._layers;
    delete r.config._layers;
    r.config = defu(r.config, ...r.layers.map((e) => e.config));
  }
  const baseLayers = [
    opts.overrides && { config: opts.overrides, configFile: void 0, cwd: void 0 },
    { config, configFile: opts.configFile, cwd: opts.cwd },
    opts.rcFile && { config: configRC, configFile: opts.rcFile }
  ].filter((l) => l && l.config);
  r.layers = [
    ...baseLayers,
    ...r.layers
  ];
  if (opts.defaults) {
    r.config = defu(r.config, opts.defaults);
  }
  return r;
}
async function extendConfig(config, opts) {
  config._layers = config._layers || [];
  if (!opts.extend) {
    return;
  }
  const key = opts.extend.extendKey;
  const extendSources = (Array.isArray(config[key]) ? config[key] : [config[key]]).filter(Boolean);
  delete config[key];
  for (const extendSource of extendSources) {
    const _config = await resolveConfig(extendSource, opts);
    if (!_config.config) {
      continue;
    }
    await extendConfig(_config.config, { ...opts, cwd: _config.cwd });
    config._layers.push(_config);
    if (_config.config._layers) {
      config._layers.push(..._config.config._layers);
      delete _config.config._layers;
    }
  }
}
const GIT_PREFIXES = ["github:", "gitlab:", "bitbucket:", "https://"];
const jiti = createJiti(null, { cache: false, interopDefault: true, requireCache: false });
async function resolveConfig(source, opts) {
  if (opts.resolve) {
    const res2 = await opts.resolve(source, opts);
    if (res2) {
      return res2;
    }
  }
  if (GIT_PREFIXES.some((prefix) => source.startsWith(prefix))) {
    const url = new URL(source);
    const subPath = url.pathname.split("/").slice(2).join("/");
    const gitRepo = url.protocol + url.pathname.split("/").slice(0, 2).join("/");
    const tmpdir = resolve(os.tmpdir(), "c12/", gitRepo.replace(/[#:@/\\]/g, "_"));
    await promises.rm(tmpdir, { recursive: true }).catch(() => {
    });
    const gittar = await import('gittar').then((r) => r.default || r);
    const tarFile = await gittar.fetch(gitRepo);
    await gittar.extract(tarFile, tmpdir);
    source = resolve(tmpdir, subPath);
  }
  const isDir = !extname(source);
  const cwd = resolve(opts.cwd, isDir ? source : dirname(source));
  if (isDir) {
    source = opts.configFile;
  }
  const res = { config: {}, cwd };
  try {
    res.configFile = jiti.resolve(resolve(cwd, source), { paths: [cwd] });
  } catch (_err) {
  }
  if (!existsSync(res.configFile)) {
    return res;
  }
  res.config = jiti(res.configFile);
  if (typeof res.config === "function") {
    res.config = await res.config();
  }
  return res;
}

export { loadConfig, loadDotenv, setupDotenv };

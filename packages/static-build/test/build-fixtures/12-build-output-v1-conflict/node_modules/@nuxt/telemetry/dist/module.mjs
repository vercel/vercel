import destr from 'destr';
import { nanoid } from 'nanoid';
import { getNuxtVersion, isNuxt3, useLogger, defineNuxtModule } from '@nuxt/kit';
import { e as ensureUserconsent, u as updateUserNuxtRc } from './chunks/consent.mjs';
import { fetch } from 'ohmyfetch';
import path, { join } from 'path';
import { existsSync } from 'fs';
import createRequire from 'create-require';
import os from 'os';
import gitUrlParse from 'git-url-parse';
import parseGitConfig from 'parse-git-config';
import isDocker from 'is-docker';
import { provider } from 'std-env';
import fs from 'fs-extra';
import { createHash } from 'crypto';
import 'chalk';
import 'inquirer';
import 'consola';
import 'rc9';

const version = "2.1.3";

async function postEvent(endpoint, body) {
  const res = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "user-agent": "Nuxt Telemetry " + version
    }
  });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
}

const build = function({ nuxt }, payload) {
  const duration = { build: payload.duration.build };
  let isSuccess = true;
  for (const [name, stat] of Object.entries(payload.stats)) {
    duration[name] = stat.duration;
    if (!stat.success) {
      isSuccess = false;
    }
  }
  return {
    name: "build",
    isSuccess,
    isDev: nuxt.options.dev || false,
    duration
  };
};

const command = function({ nuxt }) {
  let command2 = process.argv[2] || "unknown";
  const flagMap = {
    dev: "dev",
    _generate: "generate",
    _export: "export",
    _build: "build",
    _serve: "serve",
    _start: "start"
  };
  for (const flag in flagMap) {
    if (nuxt.options[flag]) {
      command2 = flagMap[flag];
      break;
    }
  }
  return {
    name: "command",
    command: command2
  };
};

const generate = function generate2({ nuxt }, payload) {
  return {
    name: "generate",
    isExport: !!nuxt.options._export,
    routesCount: payload.routesCount,
    duration: {
      generate: payload.duration.generate
    }
  };
};

const dependency = function({ nuxt: { options } }) {
  const events = [];
  const projectDeps = getDependencies(options.rootDir);
  const modules = normalizeModules(options.modules);
  const buildModules = normalizeModules(options.buildModules);
  const relatedDeps = [...modules, ...buildModules];
  for (const dep of projectDeps) {
    if (!relatedDeps.includes(dep.name)) {
      continue;
    }
    events.push({
      name: "dependency",
      packageName: dep.name,
      version: dep.version,
      isDevDependency: dep.dev,
      isModule: modules.includes(dep.name),
      isBuildModule: buildModules.includes(dep.name)
    });
  }
  return events;
};
function normalizeModules(modules) {
  return modules.map((m) => {
    if (typeof m === "string") {
      return m;
    }
    if (Array.isArray(m) && typeof m[0] === "string") {
      return m[0];
    }
    return null;
  }).filter(Boolean);
}
function getDependencies(rootDir) {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    return [];
  }
  const _require = createRequire(rootDir);
  const pkg = _require(pkgPath);
  const mapDeps = (depsObj, dev = false) => {
    const _deps = [];
    for (const name in depsObj) {
      try {
        const pkg2 = _require(join(name, "package.json"));
        _deps.push({ name, version: pkg2.version, dev });
      } catch (_e) {
        _deps.push({ name, version: depsObj[name], dev });
      }
    }
    return _deps;
  };
  const deps = [];
  if (pkg.dependencies) {
    deps.push(...mapDeps(pkg.dependencies));
  }
  if (pkg.devDependencies) {
    deps.push(...mapDeps(pkg.dependencies, true));
  }
  return deps;
}

const project = function(context) {
  const { options } = context.nuxt;
  return {
    name: "project",
    type: context.git && context.git.url ? "git" : "local",
    isSSR: options.mode === "universal" || options.ssr === true,
    target: options._generate ? "static" : "server",
    packageManager: context.packageManager
  };
};

const session = function({ seed }) {
  return {
    name: "session",
    id: seed
  };
};

const events = {
  __proto__: null,
  build: build,
  command: command,
  generate: generate,
  dependency: dependency,
  getDependencies: getDependencies,
  project: project,
  session: session
};

const FILE2PM = {
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm"
};
async function detectPackageManager(rootDir) {
  for (const file in FILE2PM) {
    if (await fs.pathExists(path.resolve(rootDir, file))) {
      return FILE2PM[file];
    }
  }
  return "unknown";
}

function hash(str) {
  return createHash("sha256").update(str).digest("hex").substr(0, 16);
}

async function createContext(nuxt, options) {
  const rootDir = nuxt.options.rootDir || process.cwd();
  const git = await getGit(rootDir);
  const packageManager = await detectPackageManager(rootDir);
  const { seed } = options;
  const projectHash = await getProjectHash(rootDir, git, seed);
  const projectSession = getProjectSession(projectHash, seed);
  const nuxtVersion = getNuxtVersion(nuxt);
  const nuxtMajorVersion = isNuxt3(nuxt) ? 3 : 2;
  const nodeVersion = process.version.replace("v", "");
  const isEdge = nuxtVersion.includes("edge");
  return {
    nuxt,
    seed,
    git,
    projectHash,
    projectSession,
    nuxtVersion,
    nuxtMajorVersion,
    isEdge,
    cli: getCLI(),
    nodeVersion,
    os: os.type().toLocaleLowerCase(),
    environment: getEnv(),
    packageManager,
    concent: options.consent
  };
}
function getEnv() {
  if (provider) {
    return provider;
  }
  if (isDocker()) {
    return "Docker";
  }
  return "unknown";
}
function getCLI() {
  const entry = process.argv[1];
  const knownCLIs = {
    "nuxt-ts.js": "nuxt-ts",
    "nuxt-start.js": "nuxt-start",
    "nuxt.js": "nuxt",
    nuxi: "nuxi"
  };
  for (const key in knownCLIs) {
    if (entry.includes(key)) {
      const edge = entry.includes("-edge") ? "-edge" : "";
      return knownCLIs[key] + edge;
    }
  }
  return "programmatic";
}
function getProjectSession(projectHash, sessionId) {
  return hash(`${projectHash}#${sessionId}`);
}
function getProjectHash(rootDir, git, seed) {
  let id;
  if (git && git.url) {
    id = `${git.source}#${git.owner}#${git.name}`;
  } else {
    id = `${rootDir}#${seed}`;
  }
  return hash(id);
}
async function getGitRemote(rootDir) {
  try {
    const parsed = await parseGitConfig({ cwd: rootDir });
    if (parsed) {
      const gitRemote = parsed['remote "origin"'].url;
      return gitRemote;
    }
    return null;
  } catch (err) {
    return null;
  }
}
async function getGit(rootDir) {
  const gitRemote = await getGitRemote(rootDir);
  if (!gitRemote) {
    return;
  }
  const meta = gitUrlParse(gitRemote);
  const url = meta.toString("https");
  return {
    url,
    gitRemote,
    source: meta.source,
    owner: meta.owner,
    name: meta.name
  };
}

const log = useLogger("@nuxt/telemetry");

class Telemetry {
  constructor(nuxt, options) {
    this.events = [];
    this.nuxt = nuxt;
    this.options = options;
  }
  getContext() {
    if (!this._contextPromise) {
      this._contextPromise = createContext(this.nuxt, this.options);
    }
    return this._contextPromise;
  }
  createEvent(name, payload) {
    const eventFactory = events[name];
    if (typeof eventFactory !== "function") {
      log.warn("Unknown event:", name);
      return;
    }
    const eventPromise = this._invokeEvent(name, eventFactory, payload);
    this.events.push(eventPromise);
  }
  async _invokeEvent(name, eventFactory, payload) {
    try {
      const context = await this.getContext();
      const event = await eventFactory(context, payload);
      event.name = name;
      return event;
    } catch (err) {
      log.error("Error while running event:", err);
    }
  }
  async getPublicContext() {
    const context = await this.getContext();
    const eventContext = {};
    for (const key of [
      "nuxtVersion",
      "nuxtMajorVersion",
      "isEdge",
      "nodeVersion",
      "cli",
      "os",
      "environment",
      "projectHash",
      "projectSession"
    ]) {
      eventContext[key] = context[key];
    }
    return eventContext;
  }
  async sendEvents(debug) {
    const events2 = [].concat(...(await Promise.all(this.events)).filter(Boolean));
    this.events = [];
    const context = await this.getPublicContext();
    const body = {
      timestamp: Date.now(),
      context,
      events: events2
    };
    if (this.options.endpoint) {
      const start = Date.now();
      try {
        if (debug) {
          log.info("Sending events:", JSON.stringify(body, null, 2));
        }
        await postEvent(this.options.endpoint, body);
        if (debug) {
          log.success(`Events sent to \`${this.options.endpoint}\` (${Date.now() - start} ms)`);
        }
      } catch (err) {
        if (debug) {
          log.error(`Error sending sent to \`${this.options.endpoint}\` (${Date.now() - start} ms)
`, err);
        }
      }
    }
  }
}

const module = defineNuxtModule({
  meta: {
    name: "@nuxt/telemetry",
    configKey: "telemetry"
  },
  defaults: {
    endpoint: process.env.NUXT_TELEMETRY_ENDPOINT || "https://telemetry.nuxtjs.com",
    debug: destr(process.env.NUXT_TELEMETRY_DEBUG),
    enabled: void 0,
    seed: void 0
  },
  async setup(toptions, nuxt) {
    if (!toptions.debug) {
      log.level = 0;
    }
    const _topLevelTelemetry = nuxt.options.telemetry;
    if (_topLevelTelemetry !== true) {
      if (toptions.enabled === false || _topLevelTelemetry === false || !await ensureUserconsent(toptions)) {
        log.info("Telemetry disabled");
        return;
      }
    }
    log.info("Telemetry enabled");
    if (!toptions.seed) {
      toptions.seed = hash(nanoid());
      updateUserNuxtRc("telemetry.seed", toptions.seed);
      log.info("Seed generated:", toptions.seed);
    }
    const t = new Telemetry(nuxt, toptions);
    nuxt.hook("modules:done", () => {
      t.createEvent("project");
      t.createEvent("session");
      t.createEvent("command");
      t.sendEvents(toptions.debug);
    });
  }
});

export { module as default };

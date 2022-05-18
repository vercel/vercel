import http from 'http';
import https from 'https';
import { promisify } from 'util';
import { existsSync, writeFileSync, chmodSync, readFileSync, promises, constants, statSync } from 'fs';
import os, { networkInterfaces } from 'os';
import { gray, cyan, underline, bold } from 'colorette';
import { getPort } from 'get-port-please';
import addShutdown from 'http-shutdown';
import defu from 'defu';
import childProcess from 'child_process';
import { join } from 'path';

const { platform, arch } = process;
const getWslDrivesMountPoint = (() => {
  const defaultMountPoint = "/mnt/";
  let mountPoint;
  return async function() {
    if (mountPoint) {
      return mountPoint;
    }
    const configFilePath = "/etc/wsl.conf";
    let isConfigFileExists = false;
    try {
      await promises.access(configFilePath, constants.F_OK);
      isConfigFileExists = true;
    } catch {
    }
    if (!isConfigFileExists) {
      return defaultMountPoint;
    }
    const configContent = await promises.readFile(configFilePath, { encoding: "utf8" });
    const configMountPoint = /(?<!#.*)root\s*=\s*(?<mountPoint>.*)/g.exec(configContent);
    if (!configMountPoint) {
      return defaultMountPoint;
    }
    mountPoint = configMountPoint.groups.mountPoint.trim();
    mountPoint = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
    return mountPoint;
  };
})();
const pTryEach = async (array, mapper) => {
  let latestError;
  for (const item of array) {
    try {
      return await mapper(item);
    } catch (error) {
      latestError = error;
    }
  }
  throw latestError;
};
const baseOpen = async (options) => {
  options = {
    wait: false,
    background: false,
    newInstance: false,
    allowNonzeroExitCode: false,
    ...options
  };
  if (Array.isArray(options.app)) {
    return pTryEach(options.app, (singleApp) => baseOpen({
      ...options,
      app: singleApp
    }));
  }
  let { name: app, arguments: appArguments = [] } = options.app || {};
  appArguments = [...appArguments];
  if (Array.isArray(app)) {
    return pTryEach(app, (appName) => baseOpen({
      ...options,
      app: {
        name: appName,
        arguments: appArguments
      }
    }));
  }
  let command;
  const cliArguments = [];
  const childProcessOptions = {};
  if (platform === "darwin") {
    command = "open";
    if (options.wait) {
      cliArguments.push("--wait-apps");
    }
    if (options.background) {
      cliArguments.push("--background");
    }
    if (options.newInstance) {
      cliArguments.push("--new");
    }
    if (app) {
      cliArguments.push("-a", app);
    }
  } else if (platform === "win32" || isWsl() && !isDocker()) {
    const mountPoint = await getWslDrivesMountPoint();
    command = isWsl() ? `${mountPoint}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` : `${process.env.SYSTEMROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell`;
    cliArguments.push("-NoProfile", "-NonInteractive", "\u2013ExecutionPolicy", "Bypass", "-EncodedCommand");
    if (!isWsl()) {
      childProcessOptions.windowsVerbatimArguments = true;
    }
    const encodedArguments = ["Start"];
    if (options.wait) {
      encodedArguments.push("-Wait");
    }
    if (app) {
      encodedArguments.push(`"\`"${app}\`""`, "-ArgumentList");
      if (options.target) {
        appArguments.unshift(options.target);
      }
    } else if (options.target) {
      encodedArguments.push(`"${options.target}"`);
    }
    if (appArguments.length > 0) {
      appArguments = appArguments.map((arg) => `"\`"${arg}\`""`);
      encodedArguments.push(appArguments.join(","));
    }
    options.target = Buffer.from(encodedArguments.join(" "), "utf16le").toString("base64");
  } else {
    if (app) {
      command = app;
    } else {
      command = "xdg-open";
      const useSystemXdgOpen = process.versions.electron || platform === "android";
      if (!useSystemXdgOpen) {
        command = join(os.tmpdir(), "xdg-open");
        if (!existsSync(command)) {
          try {
            writeFileSync(join(os.tmpdir(), "xdg-open"), await import('./chunks/xdg-open.mjs').then((r) => r.xdgOpenScript()), "utf8");
            chmodSync(command, 493);
          } catch {
            command = "xdg-open";
          }
        }
      }
    }
    if (appArguments.length > 0) {
      cliArguments.push(...appArguments);
    }
    if (!options.wait) {
      childProcessOptions.stdio = "ignore";
      childProcessOptions.detached = true;
    }
  }
  if (options.target) {
    cliArguments.push(options.target);
  }
  if (platform === "darwin" && appArguments.length > 0) {
    cliArguments.push("--args", ...appArguments);
  }
  const subprocess = childProcess.spawn(command, cliArguments, childProcessOptions);
  if (options.wait) {
    return new Promise((resolve, reject) => {
      subprocess.once("error", reject);
      subprocess.once("close", (exitCode) => {
        if (options.allowNonzeroExitCode && exitCode > 0) {
          reject(new Error(`Exited with code ${exitCode}`));
          return;
        }
        resolve(subprocess);
      });
    });
  }
  subprocess.unref();
  return subprocess;
};
const open = (target, options = {}) => {
  if (typeof target !== "string") {
    throw new TypeError("Expected a `target`");
  }
  return baseOpen({
    ...options,
    target
  });
};
const openApp = (name, options) => {
  if (typeof name !== "string") {
    throw new TypeError("Expected a `name`");
  }
  const { arguments: appArguments = [] } = options || {};
  if (appArguments !== void 0 && appArguments !== null && !Array.isArray(appArguments)) {
    throw new TypeError("Expected `appArguments` as Array type");
  }
  return baseOpen({
    ...options,
    app: {
      name,
      arguments: appArguments
    }
  });
};
function detectArchBinary(binary) {
  if (typeof binary === "string" || Array.isArray(binary)) {
    return binary;
  }
  const { [arch]: archBinary } = binary;
  if (!archBinary) {
    throw new Error(`${arch} is not supported`);
  }
  return archBinary;
}
function detectPlatformBinary({ [platform]: platformBinary }, { wsl }) {
  if (wsl && isWsl()) {
    return detectArchBinary(wsl);
  }
  if (!platformBinary) {
    throw new Error(`${platform} is not supported`);
  }
  return detectArchBinary(platformBinary);
}
const apps = {};
defineLazyProperty(apps, "chrome", () => detectPlatformBinary({
  darwin: "google chrome",
  win32: "chrome",
  linux: ["google-chrome", "google-chrome-stable", "chromium"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    x64: ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
  }
}));
defineLazyProperty(apps, "firefox", () => detectPlatformBinary({
  darwin: "firefox",
  win32: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
  linux: "firefox"
}, {
  wsl: "/mnt/c/Program Files/Mozilla Firefox/firefox.exe"
}));
defineLazyProperty(apps, "edge", () => detectPlatformBinary({
  darwin: "microsoft edge",
  win32: "msedge",
  linux: ["microsoft-edge", "microsoft-edge-dev"]
}, {
  wsl: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
}));
open.apps = apps;
open.openApp = openApp;
function defineLazyProperty(object, propertyName, valueGetter) {
  const define = (value) => Object.defineProperty(object, propertyName, { value, enumerable: true, writable: true });
  Object.defineProperty(object, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      const result = valueGetter();
      define(result);
      return result;
    },
    set(value) {
      define(value);
    }
  });
  return object;
}
function _isWsl() {
  if (process.platform !== "linux") {
    return false;
  }
  if (os.release().toLowerCase().includes("microsoft")) {
    if (isDocker()) {
      return false;
    }
    return true;
  }
  try {
    return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft") ? !isDocker() : false;
  } catch (_) {
    return false;
  }
}
let isWSLCached;
function isWsl() {
  if (isWSLCached === void 0) {
    isWSLCached = _isWsl();
  }
  return isWSLCached;
}
function hasDockerEnv() {
  try {
    statSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}
function hasDockerCGroup() {
  try {
    return readFileSync("/proc/self/cgroup", "utf8").includes("docker");
  } catch {
    return false;
  }
}
let isDockerCached;
function isDocker() {
  if (isDockerCached === void 0) {
    isDockerCached = hasDockerEnv() || hasDockerCGroup();
  }
  return isDockerCached;
}

async function listen(handle, opts = {}) {
  opts = defu(opts, {
    port: process.env.PORT || 3e3,
    hostname: process.env.HOST || "0.0.0.0",
    showURL: true,
    baseURL: "/",
    open: false,
    clipboard: false,
    isTest: process.env.NODE_ENV === "test",
    isProd: process.env.NODE_ENV === "production",
    autoClose: true,
    selfsigned: {
      keySize: 2048
    }
  });
  if (opts.isTest) {
    opts.showURL = false;
  }
  if (opts.isProd || opts.isTest) {
    opts.open = false;
    opts.clipboard = false;
  }
  const port = await getPort(opts.port);
  let server;
  let url;
  const isExternal = opts.hostname === "0.0.0.0";
  const displayHost = isExternal ? "localhost" : opts.hostname;
  if (opts.https) {
    const { key, cert } = opts.certificate ? await resolveCert(opts.certificate) : await getSelfSignedCert(opts.selfsigned);
    server = https.createServer({ key, cert }, handle);
    addShutdown(server);
    await promisify(server.listen.bind(server))(port, opts.hostname);
    url = `https://${displayHost}:${port}${opts.baseURL}`;
  } else {
    server = http.createServer(handle);
    addShutdown(server);
    await promisify(server.listen.bind(server))(port, opts.hostname);
    url = `http://${displayHost}:${port}${opts.baseURL}`;
  }
  let _closed = false;
  const close = () => {
    if (_closed) {
      return Promise.resolve();
    }
    _closed = true;
    return promisify(server.shutdown)();
  };
  if (opts.clipboard) {
    const clipboardy = await import('clipboardy').then((r) => r.default || r);
    await clipboardy.write(url).catch(() => {
      opts.clipboard = false;
    });
  }
  const showURL = () => {
    const add = opts.clipboard ? gray("(copied to clipboard)") : "";
    const lines = [];
    lines.push(`  > Local:    ${formatURL(url)} ${add}`);
    if (isExternal) {
      for (const ip of getExternalIps()) {
        lines.push(`  > Network:  ${formatURL(url.replace("localhost", ip))}`);
      }
    }
    console.log("\n" + lines.join("\n") + "\n");
  };
  if (opts.showURL) {
    showURL();
  }
  const _open = async () => {
    await open(url).catch(() => {
    });
  };
  if (opts.open) {
    await _open();
  }
  if (opts.autoClose) {
    process.on("exit", () => close());
  }
  return {
    url,
    server,
    open: _open,
    showURL,
    close
  };
}
async function resolveCert(input) {
  const key = await promises.readFile(input.key, "utf-8");
  const cert = await promises.readFile(input.cert, "utf-8");
  return { key, cert };
}
async function getSelfSignedCert(opts = {}) {
  const { generate } = await import('selfsigned');
  const { private: key, cert } = await promisify(generate)(opts.attrs, opts);
  return { key, cert };
}
function getExternalIps() {
  const ips = /* @__PURE__ */ new Set();
  for (const details of Object.values(networkInterfaces())) {
    if (details) {
      for (const d of details) {
        if (d.family === "IPv4" && !d.internal) {
          ips.add(d.address);
        }
      }
    }
  }
  return Array.from(ips);
}
function formatURL(url) {
  return cyan(underline(decodeURI(url).replace(/:(\d+)\//g, `:${bold("$1")}/`)));
}

export { listen };

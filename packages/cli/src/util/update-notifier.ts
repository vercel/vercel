import type { PackageJson } from '@vercel/build-utils';
import { mkdirpSync, readJSONSync, writeJSONSync } from 'fs-extra';
import { Agent as HttpsAgent } from 'https';
import fetch from 'node-fetch';
import { join } from 'path';
import XDGAppPaths from 'xdg-app-paths';

interface UpdateNotifierConfig {
  version: string;
  expireAt: number;
  notified: boolean;
}

const xdgDir = XDGAppPaths('com.vercel.cli').cache();
const cacheDir = join(xdgDir, 'update-notifier');

export class UpdateNotifier {
  private pkg: PackageJson;
  private distTag: string;
  private updateCheckInterval: number;
  private cacheFile: string;

  constructor({
    pkg,
    distTag,
    updateCheckInterval,
  }: {
    pkg: PackageJson;
    distTag: string;
    updateCheckInterval: number;
  }) {
    this.pkg = pkg;
    this.distTag = distTag;
    this.updateCheckInterval = updateCheckInterval;
    this.cacheFile = join(cacheDir, `${pkg.name}-${distTag}.json`);
  }

  getLastestVersion(): string | null {
    const { pkg, cacheFile } = this;

    let config: UpdateNotifierConfig;
    try {
      config = readJSONSync(cacheFile);
    } catch (e) {
      console.error(`failed to read ${cacheFile}`);
      return null;
    }

    if (
      config.version !== pkg.version &&
      !config.notified &&
      process.stdout.isTTY
    ) {
      config.notified = true;
      writeJSONSync(cacheFile, config);
      return config.version;
    }
    return null;
  }

  async fetchAndUpdateInBackground() {
    const { pkg, cacheFile } = this;
    let config: UpdateNotifierConfig | undefined;
    try {
      config = readJSONSync(cacheFile);
    } catch (e) {
      console.log(`failed to read ${cacheFile}`);
    }
    if (
      !config ||
      config.version !== pkg.version ||
      config.expireAt < Date.now()
    ) {
      // TODO: run in background process
      await this.fetchAndUpdate();
    }
  }

  private async fetchAndUpdate() {
    const { pkg, distTag, cacheFile, updateCheckInterval } = this;

    // See: `npm config get maxsockets`
    const agent = new HttpsAgent({
      keepAlive: true,
      maxSockets: 15,
    });
    const headers = {
      accept:
        'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
    };

    const url = `https://registry.npmjs.org/${pkg.name}`;
    const res = await fetch(url, { agent, headers });
    const json = await res.json();
    const tags = json['dist-tags'];
    const version = tags[distTag];

    const config: UpdateNotifierConfig = {
      version,
      expireAt: Date.now() + updateCheckInterval,
      notified: false,
    };

    mkdirpSync(cacheDir);
    writeJSONSync(cacheFile, config);
  }
}
